// 명예의 전당 랭킹 집계 — 세 부문(문제 풀이 / 커뮤니티 기여 / 활동 시간)과 이를 합산한 전체 랭킹.
//
// 활동 시간은 별도 체류시간 트래킹 없이 기존 활동 로그(RunAttempt·Submission·InterviewSession·
// debateQSession·Post·Comment)의 타임스탬프를 30분 갭 기준으로 클러스터링해 추정한다.
// 클러스터 하나 = 한 세션이며, (마지막 이벤트 - 첫 이벤트) + 이벤트당 최소 체류 보정으로 분을 매긴다.
//
// 집계 구간(window)을 받는다. 시즌 랭킹은 그 주에 쌓인 기록만 세고, 전체 기간 랭킹은 구간 없이
// 전부 센다. 시즌이 바뀌면 구간이 옮겨 갈 뿐이라 따로 초기화할 것이 없다(app/lib/season.ts).
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { prisma } from '@/app/lib/prisma';
import { RANKS, rankForScore, type RankName } from '@/app/lib/star-score';
import { rankingDisplayName } from '@/app/lib/display-name';

export const RANKING_CATEGORIES = ['overall', 'solving', 'community', 'activity'] as const;
export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

export function isRankingCategory(value: unknown): value is RankingCategory {
  return typeof value === 'string' && (RANKING_CATEGORIES as readonly string[]).includes(value);
}

/** 활동 세션 클러스터링 파라미터 */
const SESSION_GAP_MIN = 30; // 이벤트 간 30분 이상 벌어지면 다른 세션으로 본다
const MIN_EVENT_MIN = 3; // 단발 이벤트 하나에 인정하는 최소 체류(분)

export interface RankedUser {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  starScore: number;
  rankName: string;
  rankBadgeVisible: boolean;
  /** 부문 점수 (정렬 기준) */
  score: number;
  // 상세 지표 — 카드/테이블에 함께 노출한다
  solvedCount: number; // 서로 다른 문제를 PASS로 제출한 수
  submissionCount: number;
  interviewAvg: number; // 면접 방어 평균 점수
  postCount: number;
  commentCount: number;
  likesReceived: number;
  mateContribution: number; // 디베이트메이트 활동(승인된 출제 초안 + debateQ 세션)
  activityMinutes: number;
  activeDays: number;
}

/** 이벤트 타임스탬프 배열 → 추정 활동 분 + 활동일 수 */
function estimateActivity(timestamps: Date[]): { minutes: number; activeDays: number } {
  if (timestamps.length === 0) return { minutes: 0, activeDays: 0 };
  const sorted = timestamps.map((d) => d.getTime()).sort((a, b) => a - b);
  const days = new Set<string>();
  let minutes = 0;
  let clusterStart = sorted[0];
  let clusterEnd = sorted[0];
  let clusterEvents = 1;

  const flush = () => {
    const spanMin = (clusterEnd - clusterStart) / 60_000;
    minutes += Math.max(spanMin, clusterEvents * MIN_EVENT_MIN);
  };

  for (let i = 0; i < sorted.length; i++) {
    days.add(new Date(sorted[i]).toISOString().slice(0, 10));
    if (i === 0) continue;
    const gapMin = (sorted[i] - clusterEnd) / 60_000;
    if (gapMin > SESSION_GAP_MIN) {
      flush();
      clusterStart = sorted[i];
      clusterEvents = 1;
    } else {
      clusterEvents += 1;
    }
    clusterEnd = sorted[i];
  }
  flush();

  return { minutes: Math.round(minutes), activeDays: days.size };
}

/** 부문 점수 — 각 지표를 가중 합산한다. 상대 비교용이라 절대 단위는 의미 없다. */
function solvingScore(u: RankedUser) {
  return Math.round(u.solvedCount * 25 + u.interviewAvg * 2 + u.submissionCount * 2);
}
function communityScore(u: RankedUser) {
  return Math.round(u.postCount * 12 + u.commentCount * 4 + u.likesReceived * 3 + u.mateContribution * 20);
}
function activityScore(u: RankedUser) {
  return Math.round(u.activityMinutes * 0.5 + u.activeDays * 15);
}

/**
 * 집계 구간 — 시즌 랭킹이 쓰는 [since, until) 창.
 * 두 값 모두 0이면 전체 기간이다. Date가 아니라 ms로 받는 이유는 아래 cache() 때문이다.
 */
export interface RankingWindow {
  since?: Date;
  until?: Date;
}

/**
 * 모든 사용자의 지표를 한 번에 집계하고 네 부문 점수를 전부 매긴다.
 * 부문 하나만 필요해도 집계 비용은 같으므로, 호출부는 이 결과를 재사용한다.
 *
 * 한 요청 안에서 같은 구간을 여러 번 물어도(탭·배너·내 순위) 실제 집계는 한 번만 돈다.
 * React cache()는 인자를 동일성으로 비교하므로 Date가 아닌 ms 숫자를 키로 쓴다.
 */
const collectScoreboard = cache(async (sinceMs: number, untilMs: number) => {
  // 구간이 있으면 활동 기록 쿼리마다 같은 createdAt 필터를 건다.
  // 사용자 목록은 거르지 않는다 — 가입 시점이 아니라 이 구간의 활동으로 순위를 매기기 때문이다.
  const createdAt =
    sinceMs || untilMs
      ? {
          ...(sinceMs ? { gte: new Date(sinceMs) } : {}),
          ...(untilMs ? { lt: new Date(untilMs) } : {}),
        }
      : undefined;
  const inWindow = createdAt ? { createdAt } : {};

  const [users, passedGroups, submissionGroups, interviews, posts, comments, likes, drafts, debateQ, runAttempts] =
    await Promise.all([
      prisma.user.findMany({
        select: { id: true, name: true, anonymousTag: true, avatarUrl: true, role: true, starScore: true, rankBadgeVisible: true, createdAt: true },
      }),
      // 서로 다른 문제 PASS 수 — distinct 조합을 세기 위해 groupBy 사용
      prisma.submission.groupBy({
        by: ['userId', 'problemId'],
        where: { status: 'PASS', ...inWindow },
        _count: { _all: true },
      }),
      prisma.submission.groupBy({ by: ['userId'], where: inWindow, _count: { _all: true } }),
      prisma.interviewSession.findMany({ where: inWindow, select: { userId: true, defenseScore: true, createdAt: true } }),
      prisma.post.findMany({ where: inWindow, select: { authorId: true, createdAt: true } }),
      prisma.comment.findMany({ where: inWindow, select: { authorId: true, createdAt: true } }),
      prisma.postLike.groupBy({ by: ['postId'], where: inWindow, _count: { _all: true } }),
      prisma.problemDraft.groupBy({ by: ['authorId'], where: { status: 'approved', ...inWindow }, _count: { _all: true } }),
      prisma.debateQSession.findMany({ where: inWindow, select: { userId: true, createdAt: true } }),
      prisma.runAttempt.findMany({ where: inWindow, select: { userId: true, createdAt: true } }),
    ]);

  // 좋아요는 postId → authorId 매핑이 필요하다
  const likedPostIds = likes.map((l) => l.postId);
  const postAuthors = likedPostIds.length
    ? await prisma.post.findMany({ where: { id: { in: likedPostIds } }, select: { id: true, authorId: true } })
    : [];
  const postAuthorById = new Map(postAuthors.map((p) => [p.id, p.authorId]));

  const rows = new Map<string, RankedUser>();
  const timestamps = new Map<string, Date[]>();
  const interviewScores = new Map<string, number[]>();

  for (const u of users) {
    rows.set(u.id, {
      userId: u.id,
      name: rankingDisplayName(u),
      // 등급 비공개 사용자는 아바타도 노출하지 않는다(익명성 유지)
      avatarUrl: u.rankBadgeVisible ? u.avatarUrl : null,
      role: u.role,
      starScore: u.starScore,
      rankName: rankForScore(u.starScore).name,
      rankBadgeVisible: u.rankBadgeVisible,
      score: 0,
      solvedCount: 0,
      submissionCount: 0,
      interviewAvg: 0,
      postCount: 0,
      commentCount: 0,
      likesReceived: 0,
      mateContribution: 0,
      activityMinutes: 0,
      activeDays: 0,
    });
    timestamps.set(u.id, []);
  }

  const push = (userId: string, at: Date) => timestamps.get(userId)?.push(at);

  for (const g of passedGroups) {
    const row = rows.get(g.userId);
    if (row) row.solvedCount += 1;
  }
  for (const g of submissionGroups) {
    const row = rows.get(g.userId);
    if (row) row.submissionCount += g._count._all;
  }
  for (const s of interviews) {
    const row = rows.get(s.userId);
    if (!row) continue;
    if (typeof s.defenseScore === 'number') {
      const list = interviewScores.get(s.userId) ?? [];
      list.push(s.defenseScore);
      interviewScores.set(s.userId, list);
    }
    push(s.userId, s.createdAt);
  }
  for (const p of posts) {
    const row = rows.get(p.authorId);
    if (!row) continue;
    row.postCount += 1;
    push(p.authorId, p.createdAt);
  }
  for (const c of comments) {
    const row = rows.get(c.authorId);
    if (!row) continue;
    row.commentCount += 1;
    push(c.authorId, c.createdAt);
  }
  for (const l of likes) {
    const authorId = postAuthorById.get(l.postId);
    const row = authorId ? rows.get(authorId) : undefined;
    if (row) row.likesReceived += l._count._all;
  }
  for (const d of drafts) {
    const row = rows.get(d.authorId);
    if (row) row.mateContribution += d._count._all;
  }
  for (const s of debateQ) {
    const row = rows.get(s.userId);
    if (!row) continue;
    row.mateContribution += 1;
    push(s.userId, s.createdAt);
  }
  for (const a of runAttempts) {
    push(a.userId, a.createdAt);
  }

  for (const row of rows.values()) {
    const scores = interviewScores.get(row.userId) ?? [];
    row.interviewAvg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const estimated = estimateActivity(timestamps.get(row.userId) ?? []);
    row.activityMinutes = estimated.minutes;
    row.activeDays = estimated.activeDays;
  }

  const all = [...rows.values()];

  // 부문 점수를 미리 계산해 두고 overall은 백분위 평균으로 합성한다
  const solving = new Map(all.map((u) => [u.userId, solvingScore(u)]));
  const community = new Map(all.map((u) => [u.userId, communityScore(u)]));
  const activity = new Map(all.map((u) => [u.userId, activityScore(u)]));

  const maxOf = (m: Map<string, number>) => Math.max(1, ...m.values());
  const maxSolving = maxOf(solving);
  const maxCommunity = maxOf(community);
  const maxActivity = maxOf(activity);

  const overall = new Map(
    all.map((u) => [
      u.userId,
      Math.round(
        ((solving.get(u.userId)! / maxSolving) * 45 +
          (community.get(u.userId)! / maxCommunity) * 30 +
          (activity.get(u.userId)! / maxActivity) * 25) *
          10,
      ),
    ]),
  );

  const byCategory: Record<RankingCategory, Map<string, number>> = { overall, solving, community, activity };

  // 부문별 정렬 결과를 미리 만들어 둔다 — score 필드는 해당 부문 점수로 채운 사본이다
  const boards = Object.fromEntries(
    RANKING_CATEGORIES.map((category) => {
      const scores = byCategory[category];
      const list = all
        .map((u) => ({ ...u, score: scores.get(u.userId)! }))
        .filter((u) => u.score > 0)
        .sort((a, b) => b.score - a.score || b.starScore - a.starScore || a.name.localeCompare(b.name));
      return [category, list];
    }),
  ) as Record<RankingCategory, RankedUser[]>;

  return boards;
});

/** RankingWindow → cache 키(ms 쌍). 구간이 없으면 0. */
function windowKey(window?: RankingWindow): [number, number] {
  return [window?.since?.getTime() ?? 0, window?.until?.getTime() ?? 0];
}

/** 한 부문의 상위 랭킹. */
export async function getRankings(category: RankingCategory = 'overall', limit = 100, window?: RankingWindow) {
  const boards = await collectScoreboard(...windowKey(window));
  return boards[category].slice(0, limit);
}

/**
 * 배너용 상위 몇 명 — 요청 간에도 캐시한다.
 *
 * 커뮤니티를 열 때마다 전체 점수판을 다시 집계할 이유는 없다(이름 세 개를 얻자고 모든
 * 제출·글·댓글을 훑는다). 시즌 구간을 캐시 키에 넣어 두면 시즌이 넘어가는 순간 키가 바뀌어
 * 새 순위가 잡히고, 그 안에서는 몇 분 간격으로만 다시 집계된다.
 */
export function getTopRankers(category: RankingCategory, limit: number, window?: RankingWindow) {
  const [since, until] = windowKey(window);
  return unstable_cache(
    () => getRankings(category, limit, window),
    ['ranking-top', category, String(limit), String(since), String(until)],
    { revalidate: 300 },
  )();
}

/** 네 부문 랭킹을 한 번에 — 명예의 전당 페이지가 탭 전환 없이 모두 렌더할 때 쓴다. */
export async function getAllRankings(limit = 100, window?: RankingWindow) {
  const boards = await collectScoreboard(...windowKey(window));
  return Object.fromEntries(
    RANKING_CATEGORIES.map((category) => [category, boards[category].slice(0, limit)]),
  ) as Record<RankingCategory, RankedUser[]>;
}

/**
 * 지난 시즌 대비 순위 변동 — userId → (이전 순위 - 지금 순위).
 * 양수면 오른 것, null이면 지난 시즌에 순위가 없던(신규 진입) 사람이다.
 */
export async function getRankDeltas(
  category: RankingCategory,
  current: RankedUser[],
  previousWindow: RankingWindow,
): Promise<Map<string, number | null>> {
  const boards = await collectScoreboard(...windowKey(previousWindow));
  const before = new Map(boards[category].map((u, i) => [u.userId, i + 1]));
  return new Map(
    current.map((u, i) => {
      const prev = before.get(u.userId);
      return [u.userId, prev === undefined ? null : prev - (i + 1)];
    }),
  );
}

/**
 * 등급별 랭킹 — Bronze/Silver/Gold/Platinum/Diamond 각 구간 안에서 다시 순위를 매긴다.
 * 전체 랭킹 상위권이 고등급에 몰려도 각 등급 안의 1위를 보여줄 수 있다.
 */
export async function getRankingsByTier(category: RankingCategory = 'overall', perTier = 10, window?: RankingWindow) {
  const boards = await collectScoreboard(...windowKey(window));
  const list = boards[category];

  return RANKS.map((tier) => ({
    tier: tier.name,
    min: tier.min,
    max: tier.max,
    members: list.filter((u) => u.rankName === tier.name).slice(0, perTier),
    total: list.filter((u) => u.rankName === tier.name).length,
  })).filter((group) => group.total > 0);
}

export type TierGroup = Awaited<ReturnType<typeof getRankingsByTier>>[number];
export type { RankName };

/** 특정 사용자의 부문별 순위 — 대시보드에서 "내 순위"로 쓴다. */
export async function getMyRanks(userId: string, window?: RankingWindow) {
  const boards = await collectScoreboard(...windowKey(window));
  return Object.fromEntries(
    RANKING_CATEGORIES.map((category) => {
      const list = boards[category];
      const index = list.findIndex((u) => u.userId === userId);
      return [
        category,
        { rank: index >= 0 ? index + 1 : null, total: list.length, row: index >= 0 ? list[index] : null },
      ];
    }),
  ) as Record<RankingCategory, { rank: number | null; total: number; row: RankedUser | null }>;
}
