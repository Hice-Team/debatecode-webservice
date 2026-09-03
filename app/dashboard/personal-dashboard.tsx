import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { RadarChart, BarDistribution } from '@/app/components/charts';
import I18nSlot from '@/app/components/i18n-slot';
import { RANKS, rankForScore } from '@/app/lib/star-score';
import { getMyRanks } from '@/app/lib/ranking';
import { getPointSummary } from '@/app/lib/points';
import MateApply from './mate-apply';
import {
  DIFFICULTY_LABELS,
  LANGUAGE_LABELS,
  type DefenseReport,
  type Language,
} from '@/app/lib/types';


const RADAR_CATEGORIES = ['해시', '스택', 'DP', '그래프', '그리디', '자료구조'];

// dataviz 검증 통과 팔레트 — 언어/도메인 분포
const DIST_COLORS = { language: '#0369a1', domain: '#047857' };

// 벤토 타일 공용 스타일 (Premium)
// 타일 하나 — 종이 한 장 들린 정도의 그림자만 준다(DESIGN.md §6).
// 예전에는 타일마다 큰 그림자가 깔리고 호버할 때 위로 떠올랐다. 대시보드는 한 화면에
// 타일이 열 개 넘게 놓이는 자리라, 그 하나하나가 떠오르면 어디를 봐야 할지 알 수 없다.
const TILE =
  'rounded-[var(--radius-panel)] border border-hairline bg-surface p-5 shadow-[0_1px_3px_rgba(8,9,26,0.05)]';

// 연속 학습일(스트릭) — 활동한 날짜 집합에서 오늘(또는 어제)부터 이어지는 연속 일수.
function computeStreak(dates: Date[]): number {
  const days = new Set(dates.map((d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }));
  if (days.size === 0) return 0;
  const oneDay = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let cursor = today.getTime();
  if (!days.has(cursor)) cursor -= oneDay; // 오늘 활동이 없으면 어제부터 인정
  let streak = 0;
  while (days.has(cursor)) { streak++; cursor -= oneDay; }
  return streak;
}

export default async function PersonalDashboard({ userId, name, role }: { userId: string; name: string; role: string }) {
  const isMate = role === 'debate_mate' || role === 'admin';

  const [passedProblems, totalSubmissions, recentSubmissions, interviews, allSubs, myPosts, myComments, newReplies, mateApp, debateQCount, profile, myRanks, points] =
    await Promise.all([
      prisma.submission.findMany({ where: { userId, status: 'PASS' }, select: { problemId: true }, distinct: ['problemId'] }),
      prisma.submission.count({ where: { userId } }),
      prisma.submission.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, status: true, problemId: true, language: true, problem: { select: { title: true, difficulty: true } } },
      }),
      prisma.interviewSession.findMany({
        where: { userId, status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, defenseScore: true, weakKeywords: true, report: true, createdAt: true,
          submission: { select: { problem: { select: { id: true, title: true, category: true } } } },
        },
      }),
      prisma.submission.findMany({ where: { userId }, select: { language: true, status: true, createdAt: true, problem: { select: { category: true } } } }),
      prisma.post.count({ where: { authorId: userId } }),
      prisma.comment.count({ where: { authorId: userId } }),
      prisma.comment.count({ where: { post: { authorId: userId }, authorId: { not: userId } } }),
      prisma.debateMateApplication.findUnique({ where: { userId }, select: { status: true } }),
      prisma.debateQSession.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { starScore: true, rankBadgeVisible: true, profileGoal: true },
      }),
      getMyRanks(userId),
      // 포인트가 전 회원에게 열렸으므로 대시보드에서 잔액과 상점 진입을 함께 보여 준다
      getPointSummary(userId),
    ]);

  // ---- 통계 집계 ----
  const solvedProblemIds = new Set(passedProblems.map((s) => s.problemId));
  const reports = interviews.map((iv) => ({ interview: iv, report: iv.report as unknown as DefenseReport | null }));
  const allRounds = reports.flatMap((r) => r.report?.rounds ?? []);
  const defendedRounds = allRounds.filter((r) => r.verdict === 'DEFENDED').length;
  const responseRate = allRounds.length ? Math.round((defendedRounds / allRounds.length) * 100) : null;
  const avgDefense = interviews.length ? Math.round(interviews.reduce((s, iv) => s + (iv.defenseScore ?? 0), 0) / interviews.length) : null;
  const streak = computeStreak(allSubs.map((s) => s.createdAt));

  // 약점 키워드
  const weakMap = new Map<string, { count: number; categories: Set<string>; problems: Set<string> }>();
  for (const { interview: iv } of reports) {
    const keywords = (iv.weakKeywords as unknown as string[]) ?? [];
    for (const kw of keywords) {
      const entry = weakMap.get(kw) ?? { count: 0, categories: new Set(), problems: new Set() };
      entry.count++;
      entry.categories.add(iv.submission.problem.category);
      entry.problems.add(iv.submission.problem.title);
      weakMap.set(kw, entry);
    }
  }
  const weakKeywords = [...weakMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);

  // 역량 레이더 — 카테고리별 통과율 / 언어·도메인 분포
  const catTotals = new Map<string, { pass: number; total: number }>();
  const langCount = new Map<string, number>();
  const domainCount = new Map<string, number>();
  for (const s of allSubs) {
    const cat = s.problem.category;
    const e = catTotals.get(cat) ?? { pass: 0, total: 0 };
    e.total++;
    if (s.status === 'PASS') e.pass++;
    catTotals.set(cat, e);
    langCount.set(s.language, (langCount.get(s.language) ?? 0) + 1);
    domainCount.set(cat, (domainCount.get(cat) ?? 0) + 1);
  }
  const radarAxes = RADAR_CATEGORIES.map((c) => {
    const e = catTotals.get(c);
    return { label: c, value: e && e.total > 0 ? Math.round((e.pass / e.total) * 100) : 0 };
  });
  const langDist = [...langCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: LANGUAGE_LABELS[k as Language] ?? k, value: v }));
  const domainDist = [...domainCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }));

  const mateStatus = role === 'debate_mate' ? 'mate' : (mateApp?.status as 'pending' | 'approved' | 'rejected' | undefined) ?? 'none';

  // ---- Star 점수 / 티어 / 명예의 전당 순위 ----
  const starScore = profile?.starScore ?? 0;
  const currentRank = rankForScore(starScore);
  const nextRank = RANKS.find((r) => r.min > starScore) ?? null;
  const tierProgress = nextRank
    ? Math.round(((starScore - currentRank.min) / (nextRank.min - currentRank.min)) * 100)
    : 100;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      {/* ────────── 1. 머리 — 누구의 화면이고, 지금 어디쯤인지 ──────────
          큰 카드로 만들지 않는다. 이름과 스트릭은 확인하는 정보이지 누르는 것이 아니다. */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            <I18nSlot k="dash-eyebrow" fallback="MY DASHBOARD" />
          </p>
          <h1
            className="mt-1 font-display text-[1.75rem] font-bold tracking-tight text-fg sm:text-[2rem]"
            style={{ wordBreak: 'keep-all' }}
          >
            {name}
            <I18nSlot k="dash-title-suffix" fallback="님의 디베이트 현황" />
          </h1>
          {/* 지금의 목표 — 설정 › 개인 맞춤에서 적은 한 줄. 적어 둔 사람에게만 보인다. */}
          {profile?.profileGoal && (
            <p className="mt-2 flex items-start gap-2 text-sm text-fg-secondary">
              <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
              <span className="min-w-0">{profile.profileGoal}</span>
            </p>
          )}
        </div>

        <p className="shrink-0 text-sm text-fg-secondary" role="status">
          {streak > 0 ? (
            <>
              <span className="font-display text-2xl font-bold text-signal">{streak}</span>
              <I18nSlot k="dash-streak-active" fallback="일 연속 학습 중" />
            </>
          ) : (
            <I18nSlot k="dash-streak-none" fallback="오늘 한 문제로 스트릭을 시작하세요." />
          )}
        </p>
      </header>

      {/* ────────── 2. 다음에 할 일 — 이 화면의 유일한 채워진 버튼 ──────────
          대시보드에 온 사람이 하려는 일은 "다음에 뭘 풀지 고르기"다(DESIGN.md §13).
          그래서 화면에서 가장 먼저, 가장 크게 그 하나만 묻는다. */}
      <section
        aria-labelledby="next-title"
        className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[var(--radius-panel)] border border-hairline bg-surface p-5 shadow-[0_1px_3px_rgba(8,9,26,0.05)] sm:p-6"
      >
        <div className="min-w-0 flex-1">
          <h2 id="next-title" className="font-display text-[15px] font-bold tracking-tight text-fg">
            {weakKeywords.length > 0 ? '약점부터 다시 볼까요?' : '오늘 한 문제 풀어 볼까요?'}
          </h2>
          <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-secondary">
            {weakKeywords.length > 0 ? (
              <>
                면접에서 <strong className="font-semibold text-fg">{weakKeywords[0][0]}</strong> 을(를){' '}
                {weakKeywords[0][1].count}번 방어하지 못했습니다. 같은 곳에서 또 막히기 전에 짚고 갑니다.
              </>
            ) : solvedProblemIds.size === 0 ? (
              '아직 통과한 문제가 없습니다. 쉬운 문제부터 하나 풀면 여기에 기록이 쌓입니다.'
            ) : (
              `지금까지 ${solvedProblemIds.size}문제를 통과했습니다. 이어서 한 문제 더 풀어 보세요.`
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={weakKeywords.length > 0 ? '#weak' : '/problems'}
            className="dc-tap inline-flex min-h-10 items-center rounded-full bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            {weakKeywords.length > 0 ? '약점 보기' : '문제 풀러 가기'}
          </Link>
          {weakKeywords.length > 0 && (
            <Link
              href="/problems"
              className="dc-tap inline-flex min-h-10 items-center rounded-full border border-hairline px-4 text-sm font-medium text-fg-secondary transition-colors hover:border-signal/40 hover:text-signal"
            >
              새 문제 풀기
            </Link>
          )}
        </div>
      </section>

      {/* ────────── 3. 오늘의 숫자 — 카드 격자가 아니라 한 줄 ──────────
          DESIGN.md §5: 목록은 카드가 아니라 줄이다. 네 숫자를 각각 카드로 세우면
          "확인하는 정보"가 "누르는 것"처럼 보인다. */}
      <dl className="mt-4 grid grid-cols-2 divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface sm:grid-cols-4 sm:divide-x">
        {[
          { k: 'solved', label: '푼 문제', value: `${solvedProblemIds.size}`, sub: '전체 통과' },
          { k: 'submissions', label: '총 제출', value: `${totalSubmissions}`, sub: '제출 기준' },
          {
            k: 'response',
            label: '면접 응답률',
            value: responseRate != null ? `${responseRate}%` : '—',
            sub: responseRate != null ? '방어 성공' : '면접 기록 없음',
          },
          {
            k: 'defense',
            label: '평균 방어율',
            value: avgDefense != null ? `${avgDefense}%` : '—',
            sub: `면접 ${interviews.length}건`,
          },
        ].map((c) => (
          <div key={c.k} className="border-b border-hairline px-4 py-3.5 sm:border-b-0">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">
              <I18nSlot k={`dash-kpi-${c.k}`} fallback={c.label} />
            </dt>
            <dd>
              <span className="font-display text-2xl font-bold text-fg">{c.value}</span>
              <span className="ml-1.5 text-[11px] text-fg-quiet">{c.sub}</span>
            </dd>
          </div>
        ))}
      </dl>

      {/* ────────── 4. 약점 노트 ────────── */}
      <section id="weak" className={`mt-8 scroll-mt-20 ${TILE}`} aria-labelledby="weak-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="weak-title" className="font-display text-[15px] font-bold tracking-tight text-fg">
            약점 노트
          </h2>
          <p className="text-[12px] text-fg-muted">면접에서 방어하지 못한 개념을 자주 나온 순으로</p>
        </div>

        {weakKeywords.length === 0 ? (
          // 빈 상태 — 왜 비었는지와 다음에 할 일을 함께 적는다(DESIGN.md §14)
          <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
            아직 약점으로 잡힌 개념이 없습니다. 문제를 풀고 <strong className="font-semibold text-fg">면접 방어</strong>
            까지 마치면, 대답하지 못한 개념이 여기에 모입니다.{' '}
            <Link href="/problems" className="font-medium text-signal underline underline-offset-2">
              문제 풀러 가기
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {weakKeywords.map(([keyword, entry]) => (
              <li key={keyword} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1 text-sm font-semibold text-fg">{keyword}</span>
                <span className="shrink-0 text-[12px] text-fg-muted">
                  {[...entry.categories].slice(0, 2).join(' · ')}
                </span>
                <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[11px] font-bold text-rose-600">
                  {entry.count}회
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ────────── 5. 최근 제출 · 면접 다시보기 ────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className={TILE} aria-labelledby="recent-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="recent-title" className="font-display text-[15px] font-bold tracking-tight text-fg">
              최근 제출
            </h2>
            <Link href="/problems" className="text-[12px] font-medium text-signal hover:underline">
              문제집
            </Link>
          </div>

          {recentSubmissions.length === 0 ? (
            <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
              아직 제출한 답이 없습니다.{' '}
              <Link href="/problems" className="font-medium text-signal underline underline-offset-2">
                첫 문제 풀러 가기
              </Link>
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {recentSubmissions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/problems/${s.problemId}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:text-signal"
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        s.status === 'PASS' ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{s.problem.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-fg-quiet">
                      {DIFFICULTY_LABELS[s.problem.difficulty as keyof typeof DIFFICULTY_LABELS] ??
                        s.problem.difficulty}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="replays" className={`scroll-mt-20 ${TILE}`} aria-labelledby="replays-title">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="replays-title" className="font-display text-[15px] font-bold tracking-tight text-fg">
              면접 다시보기
            </h2>
            <p className="text-[12px] text-fg-muted">{interviews.length}건</p>
          </div>

          {reports.length === 0 ? (
            <p className="mt-4 text-[13px] leading-relaxed text-fg-muted">
              아직 마친 면접이 없습니다. 문제를 통과한 뒤 <strong className="font-semibold text-fg">디베이트모드</strong>
              로 들어가면 방어 기록이 남습니다.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-hairline">
              {reports.slice(0, 6).map(({ interview: iv, report }) => {
                const rounds = report?.rounds ?? [];
                const defended = rounds.filter((r) => r.verdict === 'DEFENDED').length;
                return (
                  <li key={iv.id}>
                    <Link
                      href={`/problems/${iv.submission.problem.id}`}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:text-signal"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                        {iv.submission.problem.title}
                      </span>
                      {rounds.length > 0 && (
                        <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                          {defended}/{rounds.length}
                        </span>
                      )}
                      <span className="shrink-0 font-mono text-[10px] text-fg-quiet">
                        {new Date(iv.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ────────── 6. 역량 분포 ────────── */}
      {allSubs.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className={TILE} aria-labelledby="radar-title">
            <h2 id="radar-title" className="font-display text-[15px] font-bold tracking-tight text-fg">
              카테고리별 통과율
            </h2>
            <div className="mt-3 flex items-center justify-center">
              <RadarChart axes={radarAxes} />
            </div>
          </section>

          <section className={TILE} aria-labelledby="dist-title">
            <h2 id="dist-title" className="font-display text-[15px] font-bold tracking-tight text-fg">
              무엇을 얼마나 풀었나
            </h2>
            <div className="mt-4 space-y-5">
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">언어</p>
                <BarDistribution items={langDist} tone={DIST_COLORS.language} />
              </div>
              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">분야</p>
                <BarDistribution items={domainDist} tone={DIST_COLORS.domain} />
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ────────── 7. 물러난 것들 — 랭킹 · 포인트 · 메이트 ──────────
          확인은 하지만 여기서 하는 일은 아니다. 그래서 화면 아래, 한 줄 높이로 둔다. */}
      <section className="mt-8 border-t border-hairline pt-6" aria-labelledby="aside-title">
        <h2 id="aside-title" className="sr-only">
          랭킹과 포인트
        </h2>

        <div className="grid gap-4 md:grid-cols-3">
          {/* 등급 · Star 점수 */}
          <div className={TILE}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">RANK</p>
              <Link href="/hall-of-fame" className="text-[12px] font-medium text-signal hover:underline">
                명예의 전당
              </Link>
            </div>
            <p className="mt-1 font-display text-xl font-bold text-fg">{currentRank.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-fg-quiet">
              {starScore.toLocaleString()} Star
              {myRanks.overall ? ` · 전체 ${myRanks.overall}위` : ''}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-signal" style={{ width: `${tierProgress}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-fg-muted">
              {nextRank ? `${nextRank.name}까지 ${(nextRank.min - starScore).toLocaleString()} Star` : '최고 등급입니다.'}
            </p>
          </div>

          {/* 디베이트포인트 — 랭킹 기여도로 쌓인다 */}
          <div className={TILE}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">DEBATE POINT</p>
            <p className="mt-1 font-display text-xl font-bold text-fg">
              {points.balance.toLocaleString()}
              <span className="ml-0.5 text-sm font-semibold text-fg-muted">P</span>
            </p>
            {/* 상점이 없어졌으므로 "교환" 이야기를 하지 않는다.
                쓸 곳이 없는데 있는 것처럼 적으면 그게 지어낸 문구다(DESIGN.md §5). */}
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
              문제를 풀고 답이 채택되면 난이도에 비례해 쌓입니다. 명예의 전당 점수에 함께 반영됩니다.
            </p>
          </div>

          {/* 커뮤니티 */}
          <Link href="/community" className={`${TILE} block transition-colors hover:border-signal/40`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">COMMUNITY</p>
              {newReplies > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-600">
                  새 댓글 {newReplies}
                </span>
              )}
            </div>
            <p className="mt-1 font-display text-xl font-bold text-fg">
              글 {myPosts} · 댓글 {myComments}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg-muted">
              막히는 곳은 물어보고, 아는 것은 답해 주세요.
            </p>
          </Link>
        </div>

        {/* 디베이트메이트 — 메이트에게는 콘솔로, 아닌 사람에게는 신청으로 */}
        <div className="mt-4">
          {isMate ? (
            <Link
              href="/debate-mate/console"
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius-panel)] bg-ink p-5 text-white ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-muted">MATE CONSOLE</p>
                <p className="mt-1 font-display text-lg font-bold">디베이트메이트 콘솔</p>
                <p className="mt-1 text-[12px] leading-relaxed text-fg-on-dark-secondary">
                  문제를 출제하고 debateQ를 엽니다.
                  {debateQCount > 0 && ` 지금까지 ${debateQCount}회 진행했습니다.`}
                </p>
              </div>
              <span aria-hidden className="shrink-0 text-fg-on-dark-secondary">
                →
              </span>
            </Link>
          ) : (
            <MateApply status={mateStatus} />
          )}
        </div>
      </section>
    </div>
  );
}
