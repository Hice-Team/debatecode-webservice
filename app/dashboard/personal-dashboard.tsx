import Link from 'next/link';
import { prisma } from '@/app/lib/prisma';
import { RadarChart, BarDistribution } from '@/app/components/charts';
import I18nSlot from '@/app/components/i18n-slot';
import { RANKS, rankForScore } from '@/app/lib/star-score';
import { getMyRanks } from '@/app/lib/ranking';
import MateApply from './mate-apply';
import {
  DIFFICULTY_LABELS,
  LANGUAGE_LABELS,
  type DefenseReport,
  type Language,
  type RoundVerdict,
} from '@/app/lib/types';

const VERDICT_BADGE: Record<RoundVerdict, string> = {
  DEFENDED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
  CONCEDED: 'bg-rose-100 text-rose-700 border-rose-200',
};
const VERDICT_LABEL: Record<RoundVerdict, string> = {
  DEFENDED: '방어 성공',
  PARTIAL: '부분 방어',
  CONCEDED: '방어 실패',
};
const VERDICT_KEY: Record<RoundVerdict, string> = {
  DEFENDED: 'verdict-defended',
  PARTIAL: 'verdict-partial',
  CONCEDED: 'verdict-conceded',
};

const RADAR_CATEGORIES = ['해시', '스택', 'DP', '그래프', '그리디', '자료구조'];

// dataviz 검증 통과 팔레트 — 언어/도메인 분포
const DIST_COLORS = { language: '#0369a1', domain: '#047857' };

// 벤토 타일 공용 스타일
const TILE = 'rounded-2xl border border-ink/10 bg-white p-5';

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

  const [passedProblems, totalSubmissions, recentSubmissions, interviews, allSubs, myPosts, myComments, newReplies, mateApp, debateQCount, profile, myRanks] =
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
      prisma.user.findUnique({ where: { id: userId }, select: { starScore: true, rankBadgeVisible: true } }),
      getMyRanks(userId),
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
  const RANK_TILES = [
    { key: 'overall' as const, label: '전체' },
    { key: 'solving' as const, label: '문제 풀이' },
    { key: 'community' as const, label: '커뮤니티' },
    { key: 'activity' as const, label: '활동 시간' },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      {/* ---- 벤토 그리드 ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 히어로: 웰컴 + 스트릭 + 퀵네비 (대형) */}
        <div className="lg:col-span-8 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-white p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
                <I18nSlot k="dash-eyebrow" fallback="MY DASHBOARD" />
              </span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                {name}
                <I18nSlot k="dash-title-suffix" fallback="님의 디베이트 현황" />
              </h1>
              <p className="mt-2 text-sm text-ink-soft/60">
                {streak > 0 ? (
                  <>
                    {streak}
                    <I18nSlot k="dash-streak-active" fallback="일 연속 학습 중 — 오늘도 이어가 보세요!" />
                  </>
                ) : (
                  <I18nSlot k="dash-streak-none" fallback="오늘 한 문제로 스트릭을 시작하세요." />
                )}
              </p>
            </div>
            <div className="shrink-0 text-center" role="status">
              <p className="text-5xl font-bold text-signal" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{streak}</p>
              <p className="mt-1 font-mono text-[11px] text-ink-soft/60 tracking-wider">
                <I18nSlot k="dash-streak-unit" fallback="DAY STREAK" />
              </p>
            </div>
          </div>
          <nav className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              { href: '#weak', k: 'weak', label: '오답노트', desc: '약점 복습' },
              { href: '/problems/mine', k: 'workbook', label: '나의 문제집', desc: '스크랩 문제' },
              { href: '#replays', k: 'replays', label: '면접 다시보기', desc: '방어 리뷰' },
              { href: '/hall-of-fame', k: 'hof', label: '명예의 전당', desc: '랭킹 확인' },
            ].map((a) => (
              <Link
                key={a.k}
                href={a.href}
                className="rounded-xl border border-ink/10 bg-white/80 p-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
              >
                <p className="text-sm font-bold text-ink">
                  <I18nSlot k={`dash-nav-${a.k}`} fallback={a.label} />
                </p>
                <p className="mt-0.5 text-[11px] text-ink-soft/60">
                  <I18nSlot k={`dash-nav-${a.k}-desc`} fallback={a.desc} />
                </p>
              </Link>
            ))}
          </nav>
        </div>

        {/* KPI 타일 (2×2) */}
        <div className="lg:col-span-4 grid grid-cols-2 gap-4">
          {[
            { k: 'solved', label: '푼 문제', value: `${solvedProblemIds.size}`, sub: '전체 통과' },
            { k: 'submissions', label: '총 제출', value: `${totalSubmissions}`, sub: '제출 기준' },
            { k: 'response', label: '면접 응답률', value: responseRate != null ? `${responseRate}%` : '—', sub: '방어 성공' },
            { k: 'defense', label: '평균 방어율', value: avgDefense != null ? `${avgDefense}%` : '—', sub: null },
          ].map((c) => (
            <div key={c.k} className="relative overflow-hidden rounded-2xl border border-ink/10 bg-white p-4 flex flex-col justify-between">
              <span aria-hidden className="absolute left-0 top-0 h-full w-1 bg-signal/70" />
              <p className="font-mono text-[10px] text-ink-soft/55 tracking-wider">
                <I18nSlot k={`dash-kpi-${c.k}`} fallback={c.label} />
              </p>
              <p className="mt-1 text-2xl font-bold text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{c.value}</p>
              <p className="mt-0.5 text-[10px] text-ink-soft/55">
                {c.sub ? (
                  <I18nSlot k={`dash-kpi-${c.k}-sub`} fallback={c.sub} />
                ) : (
                  <>
                    <I18nSlot k="interview-count-prefix" fallback="면접 " />
                    {interviews.length}
                    <I18nSlot k="interview-count-suffix" fallback="건" />
                  </>
                )}
              </p>
            </div>
          ))}
        </div>

        {/* Star 점수 · 티어 · 명예의 전당 순위 (풀폭 스트립) */}
        <section className="lg:col-span-12 overflow-hidden rounded-2xl border border-ink/10 bg-white" aria-labelledby="rank-title">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:divide-x lg:divide-ink/[0.07]">
            {/* 좌: Star 점수 + 티어 진행도 */}
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 id="rank-title" className="text-sm font-bold text-ink">
                    <I18nSlot k="dash-star-title" fallback="Star 점수 · 티어" />
                  </h3>
                  <p className="mt-0.5 text-xs text-ink-soft/55">
                    <I18nSlot k="dash-star-desc" fallback="문제 해결과 방어 성과로 쌓이는 누적 점수입니다." />
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                  ★ {currentRank.name}
                </span>
              </div>

              <p className="mt-4 font-display text-4xl font-bold tracking-tight text-signal">
                {starScore.toLocaleString()}
                <span className="ml-1.5 text-sm font-semibold text-ink-soft/35">star</span>
              </p>

              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink/[0.07]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all"
                    style={{ width: `${tierProgress}%` }}
                  />
                </div>
                <p className="mt-1.5 font-mono text-[11px] text-ink-soft/45">
                  {nextRank ? (
                    <>
                      {nextRank.name}
                      <I18nSlot k="dash-star-to-next-1" fallback="까지 " />
                      {(nextRank.min - starScore).toLocaleString()}
                      <I18nSlot k="dash-star-to-next-2" fallback="점 남음" />
                    </>
                  ) : (
                    <I18nSlot k="dash-star-max" fallback="최고 티어에 도달했습니다" />
                  )}
                </p>
              </div>
            </div>

            {/* 우: 명예의 전당 부문별 내 순위 */}
            <div className="border-t border-ink/[0.07] p-5 sm:p-6 lg:border-t-0">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold text-ink">
                  <I18nSlot k="dash-rank-title" fallback="명예의 전당 · 내 순위" />
                </h3>
                <Link href="/hall-of-fame" className="shrink-0 font-mono text-[11px] text-brand-600 hover:underline">
                  <I18nSlot k="dash-rank-all" fallback="전체 랭킹 →" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {RANK_TILES.map((tile) => {
                  const entry = myRanks[tile.key];
                  return (
                    <Link
                      key={tile.key}
                      href={tile.key === 'overall' ? '/hall-of-fame' : `/hall-of-fame?tab=${tile.key}`}
                      className="rounded-xl border border-ink/10 bg-paper/40 p-3 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                    >
                      <p className="font-display text-xl font-bold text-ink">
                        {entry.rank != null ? `#${entry.rank}` : '—'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-soft/55">
                        <I18nSlot k={`rank-tab-${tile.key}`} fallback={tile.label} />
                      </p>
                      {entry.rank != null && (
                        <p className="mt-0.5 font-mono text-[9px] text-ink-soft/35">
                          / {entry.total}
                          <I18nSlot k="rank-unit-people" fallback="명" />
                        </p>
                      )}
                    </Link>
                  );
                })}
              </div>
              <p className="mt-3 text-[11px] text-ink-soft/40">
                {myRanks.overall.rank == null ? (
                  <I18nSlot k="dash-rank-none" fallback="아직 집계된 활동이 없습니다. 문제를 풀거나 글을 남기면 순위에 오릅니다." />
                ) : profile?.rankBadgeVisible ? (
                  <I18nSlot k="dash-rank-badge-on" fallback="커뮤니티 글에 티어 배지가 함께 표시됩니다." />
                ) : (
                  <I18nSlot k="dash-rank-badge-off" fallback="앱 설정에서 티어 배지 노출을 켤 수 있습니다." />
                )}
              </p>
            </div>
          </div>
        </section>

        {/* 역량 레이더 */}
        <div className={`lg:col-span-4 ${TILE}`}>
          <h3 className="text-sm font-bold text-ink mb-2">
            <I18nSlot k="dash-radar-title" fallback="역량 레이더 · 카테고리별 통과율" />
          </h3>
          <div className="flex items-center justify-center py-2">
            <RadarChart axes={radarAxes} />
          </div>
        </div>

        {/* 언어·도메인 분포 */}
        <div className={`lg:col-span-4 ${TILE} space-y-5`}>
          <div>
            <h3 className="text-sm font-bold text-ink mb-3">
              <I18nSlot k="dash-lang-dist" fallback="언어 분포" />
            </h3>
            <BarDistribution items={langDist} tone={DIST_COLORS.language} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-ink mb-3">
              <I18nSlot k="dash-domain-dist" fallback="도메인 분포" />
            </h3>
            <BarDistribution items={domainDist} tone={DIST_COLORS.domain} />
          </div>
        </div>

        {/* 커뮤니티 + 디베이트메이트/debateQ */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className={TILE}>
            <h3 className="text-sm font-bold text-ink mb-3">
              <I18nSlot k="dash-community-title" fallback="커뮤니티 · 내 활동" />
            </h3>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              {[
                { k: 'my-posts', label: '내 글', value: myPosts, highlight: false },
                { k: 'my-comments', label: '내 답글', value: myComments, highlight: false },
                { k: 'new-replies', label: '새 댓글', value: newReplies, highlight: newReplies > 0 },
              ].map((s) => (
                <Link key={s.k} href="/community" className="rounded-xl border border-ink/10 bg-paper/40 p-3 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                  <p className={`text-xl font-bold ${s.highlight ? 'text-rose-600' : 'text-ink'}`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>{s.value}</p>
                  <p className="mt-0.5 text-[10px] text-ink-soft/55">
                    <I18nSlot k={`dash-${s.k}`} fallback={s.label} />
                  </p>
                </Link>
              ))}
            </div>
          </div>

          {isMate ? (
            /* debateQ 타일 — 디베이트메이트 전용 */
            <Link
              href="/debate-mate/console"
              className="group flex-1 rounded-2xl border border-brand-300 bg-gradient-to-br from-brand-900 to-brand-700 p-5 text-white transition-transform hover:scale-[1.01] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              <p className="font-mono text-[11px] tracking-wider text-brand-200">MATE EXCLUSIVE</p>
              <p className="mt-1.5 text-xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>debateQ</p>
              <p className="mt-1.5 text-xs text-white/70 leading-relaxed">
                <I18nSlot k="dash-debateq-desc" fallback="AI가 만든 결함 코드를 수정하며 변론하는 심화 모드." />
                {debateQCount > 0 && (
                  <>
                    {' '}
                    <I18nSlot k="dash-debateq-count-prefix" fallback="지금까지 " />
                    {debateQCount}
                    <I18nSlot k="dash-debateq-count-suffix" fallback="회 완료." />
                  </>
                )}
              </p>
              <span className="mt-3 inline-block rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-brand-900 group-hover:bg-brand-50">
                <I18nSlot k="dash-mate-console-cta" fallback="디베이트메이트 활동 콘솔로 이동하기 →" />
              </span>
            </Link>
          ) : (
            <div className={`${TILE} flex-1`}>
              <h3 className="text-sm font-bold text-ink mb-1">
                <I18nSlot k="debate-mate" fallback="디베이트메이트" />
              </h3>
              <p className="mb-3 text-xs text-ink-soft/55">
                <I18nSlot k="dash-mate-desc" fallback="직접 문제를 출제하고 debateQ 모드를 여는 파트너 프로그램입니다." />
              </p>
              <MateApply status={mateStatus} />
            </div>
          )}
        </div>

        {/* 오답노트 (와이드) */}
        <section id="weak" className={`lg:col-span-6 scroll-mt-20 ${TILE}`} aria-labelledby="weak-title">
          <h3 id="weak-title" className="text-sm font-bold text-ink mb-3">
            <I18nSlot k="dash-weak-title" fallback="오답노트 · 약점 키워드" />
          </h3>
          {weakKeywords.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft/55">
              <I18nSlot k="dash-weak-empty" fallback="아직 약점 데이터가 없습니다. 면접에서 방어에 실패한 개념이 여기에 쌓입니다." />
            </p>
          ) : (
            <div className="divide-y divide-ink/5">
              {weakKeywords.map(([kw, info]) => {
                const category = [...info.categories][0];
                return (
                  <div key={kw} className="flex items-center gap-3 py-3">
                    <span className="px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-xs font-medium">{kw}</span>
                    <span className="text-xs text-ink-soft/55 truncate">
                      {[...info.problems].slice(0, 2).join(', ')}
                      <I18nSlot k="dash-weak-in" fallback="에서 " />
                      {info.count}
                      <I18nSlot k="dash-weak-times" fallback="회" />
                    </span>
                    <Link href={`/problems?category=${encodeURIComponent(category)}`} className="ml-auto font-mono text-[11px] text-brand-600 hover:underline whitespace-nowrap">
                      {category}
                      <I18nSlot k="dash-weak-retry" fallback=" 다시 풀기 →" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 최근 제출 (와이드) */}
        <section className={`lg:col-span-6 ${TILE}`} aria-labelledby="recent-title">
          <h3 id="recent-title" className="text-sm font-bold text-ink mb-3">
            <I18nSlot k="dash-recent-title" fallback="최근 제출 · 다시보기" />
          </h3>
          {recentSubmissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft/55">
              <I18nSlot k="dash-recent-empty" fallback="아직 제출 기록이 없습니다." />{' '}
              <Link href="/problems" className="text-brand-600 underline underline-offset-2">
                <I18nSlot k="dash-recent-empty-cta" fallback="첫 문제에 도전" />
              </Link>
            </p>
          ) : (
            <div className="divide-y divide-ink/5">
              {recentSubmissions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className={`font-mono text-[10px] px-2 py-0.5 rounded border ${s.status === 'PASS' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{s.status}</span>
                  <Link href={`/problems/${s.problemId}`} className="font-medium truncate hover:text-brand-600">{s.problem.title}</Link>
                  <span className="ml-auto font-mono text-[11px] text-ink-soft/50 whitespace-nowrap">
                    {LANGUAGE_LABELS[s.language as Language] ?? s.language} · {DIFFICULTY_LABELS[s.problem.difficulty]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 면접 다시보기 (풀폭) */}
        <section id="replays" className="lg:col-span-12 scroll-mt-20" aria-labelledby="replays-title">
          <div className="mb-3 flex items-end justify-between">
            <h3 id="replays-title" className="text-lg font-bold text-ink">
              <I18nSlot k="dash-replays-title" fallback="면접 분석 · 다시보기" />
            </h3>
            <Link href="/settings" className="font-mono text-[11px] text-ink-soft/55 hover:text-signal">
              <I18nSlot k="settings" fallback="설정" /> →
            </Link>
          </div>
          {reports.length === 0 ? (
            <div className={`${TILE} py-8 text-center text-sm text-ink-soft/55`}>
              <I18nSlot k="dash-replays-empty" fallback="완료된 면접이 없습니다. 문제를 전부 통과하면 AI 면접관이 기다립니다." />
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map(({ interview: iv, report }) => (
                <details key={iv.id} className="group bg-white rounded-2xl border border-ink/10 overflow-hidden">
                  <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer list-none hover:bg-paper/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal">
                    <span className={`text-2xl font-bold w-16 text-center ${(iv.defenseScore ?? 0) >= 70 ? 'text-emerald-600' : (iv.defenseScore ?? 0) >= 50 ? 'text-brand-600' : 'text-rose-600'}`} style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                      {iv.defenseScore}%
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{iv.submission.problem.title}</p>
                      <p className="font-mono text-[11px] text-ink-soft/50">{iv.submission.problem.category} · {new Date(iv.createdAt).toLocaleDateString('ko-KR')}</p>
                    </div>
                    <span className="ml-auto font-mono text-xs text-ink-soft/40 group-open:rotate-90 transition-transform" aria-hidden>▶</span>
                  </summary>
                  {report && (
                    <div className="px-5 pb-5 pt-1 border-t border-ink/5 space-y-4">
                      <p className="text-sm text-ink-soft/70 leading-relaxed">{report.summary}</p>
                      <div className="space-y-3">
                        {report.rounds.map((r) => (
                          <div key={r.round} className="rounded-lg bg-paper/60 border border-ink/5 p-4 text-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-mono text-[11px] text-ink-soft/50">ROUND {r.round}</span>
                              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${VERDICT_BADGE[r.verdict]}`}>
                                <I18nSlot k={VERDICT_KEY[r.verdict]} fallback={VERDICT_LABEL[r.verdict]} /> · {r.score}
                                <I18nSlot k="score-unit" fallback="점" />
                              </span>
                            </div>
                            <p className="text-ink-soft/80 mb-1.5"><span className="font-mono text-[11px] text-rose-500 mr-1.5">Q.</span>{r.question}</p>
                            <p className="text-ink-soft/60 mb-1.5"><span className="font-mono text-[11px] text-emerald-600 mr-1.5">A.</span>{r.answer}</p>
                            <p className="text-xs text-ink-soft/50">{r.feedback}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
