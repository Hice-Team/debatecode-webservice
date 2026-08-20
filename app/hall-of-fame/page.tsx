import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell, PageHeader } from '@/app/components/page-shell';
import I18nSlot from '@/app/components/i18n-slot';
import Avatar from '@/app/components/avatar';
import {
  getAllRankings,
  getRankDeltas,
  getRankingsByTier,
  isRankingCategory,
  withRankingFloor,
  type RankingCategory,
  type RankedUser,
} from '@/app/lib/ranking';
import { RANK_BADGE } from '@/app/lib/star-score';
import { roleLabel } from '@/app/lib/roles';
import {
  formatRemaining,
  msUntilSeasonEnd,
  previousSeason,
  currentSeason,
  seasonProgress,
  seasonRangeLabel,
} from '@/app/lib/season';

export const metadata: Metadata = { title: '명예의 전당' };

const TABS: { key: RankingCategory; label: string; desc: string; unit: string }[] = [
  { key: 'overall', label: '전체 랭킹', desc: '세 부문을 종합한 통합 순위입니다.', unit: 'pt' },
  { key: 'solving', label: '문제 풀이', desc: '해결한 문제 수와 AI 면접 방어 성적으로 매깁니다.', unit: 'pt' },
  { key: 'community', label: '커뮤니티 기여', desc: '글·댓글·받은 좋아요와 디베이트메이트 활동을 합산합니다.', unit: 'pt' },
  { key: 'activity', label: '활동 시간', desc: '풀이·면접·커뮤니티 활동 기록으로 추정한 누적 체류 시간입니다.', unit: 'pt' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

// 시상대 톤 — 1위에 강조는 두되, 숫자·배경의 시각적 무게를 낮춰 균형을 맞춘다
const PODIUM_TONE = [
  'rounded-[var(--radius-panel)] border border-amber-200 bg-gradient-to-b from-amber-50 to-white shadow-sm shadow-amber-200/10',
  'rounded-[var(--radius-panel)] border border-ink/6 bg-white',
  'rounded-[var(--radius-panel)] border border-ink/6 bg-white',
];

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

/** 부문별로 카드에 노출할 보조 지표 — key는 i18n 사전 키(rank-metric-*)와 대응한다. */
function metricsFor(category: RankingCategory, u: RankedUser) {
  if (category === 'solving')
    return [
      { key: 'solved', label: '해결', value: `${u.solvedCount}문제` },
      { key: 'submissions', label: '제출', value: `${u.submissionCount}회` },
      { key: 'interview-avg', label: '면접 평균', value: u.interviewAvg ? `${u.interviewAvg}점` : '—' },
    ];
  if (category === 'community')
    return [
      { key: 'posts', label: '작성 글', value: `${u.postCount}개` },
      { key: 'comments', label: '댓글', value: `${u.commentCount}개` },
      { key: 'likes', label: '받은 좋아요', value: `${u.likesReceived}개` },
      { key: 'mate', label: '메이트 활동', value: `${u.mateContribution}건` },
    ];
  if (category === 'activity')
    return [
      { key: 'total-time', label: '누적 활동', value: formatMinutes(u.activityMinutes) },
      { key: 'active-days', label: '활동일', value: `${u.activeDays}일` },
    ];
  return [
    { key: 'solved', label: '해결', value: `${u.solvedCount}문제` },
    { key: 'community', label: '커뮤니티', value: `${u.postCount + u.commentCount}건` },
    { key: 'activity', label: '활동', value: formatMinutes(u.activityMinutes) },
  ];
}

/** 순위 변동 뱃지 — 오름 ▲ / 내림 ▼ / 유지 – / 신규 NEW */
function RankDelta({ delta }: { delta: number | null | undefined }) {
  if (delta === undefined) return null;
  if (delta === null)
    return (
      <span className="shrink-0 rounded bg-brand-50 px-1 py-0.5 font-mono text-[9px] font-bold text-brand-700">NEW</span>
    );
  if (delta === 0) return <span className="shrink-0 font-mono text-[10px] text-fg-quiet">–</span>;
  const up = delta > 0;
  return (
    <span
      className={`shrink-0 font-mono text-[10px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-500'}`}
      title={up ? `${delta}계단 상승` : `${-delta}계단 하락`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(delta)}
    </span>
  );
}

export default async function HallOfFamePage({ searchParams }: PageProps<'/hall-of-fame'>) {
  const { tab, view, range } = await searchParams;
  const active: RankingCategory = isRankingCategory(tab) ? tab : 'overall';
  const tierView = view === 'tier';
  // 기본은 이번 시즌 — 명예의 전당은 "지금 누가 달리고 있는가"를 보는 곳이다
  const allTime = range === 'all';

  const now = new Date();
  const season = await currentSeason(now);
  const prev = previousSeason(season);
  // 콘솔에서 "랭킹 초기화"를 누르면 그 시각 이전 활동은 세지 않는다
  const window = await withRankingFloor(allTime ? undefined : { since: season.start, until: season.end });

  const [boards, tierGroups] = await Promise.all([
    getAllRankings(50, window),
    getRankingsByTier(active, 10, window),
  ]);
  const list = boards[active];
  const meta = TABS.find((t) => t.key === active)!;

  // 변동은 시즌 보기에서만 의미가 있다 — 전체 기간에는 비교할 "지난 구간"이 없다
  const deltas = allTime
    ? null
    : await getRankDeltas(active, list, (await withRankingFloor({ since: prev.start, until: prev.end }))!);

  const podium = list.slice(0, 3);
  const rest = list.slice(3);
  const remaining = msUntilSeasonEnd(season, now);
  const progress = seasonProgress(season, now);

  /** 현재 부문/보기/기간 상태를 유지한 링크 */
  const hrefFor = (next: { tab?: RankingCategory; view?: 'tier' | undefined; range?: 'all' | undefined }) => {
    const params = new URLSearchParams();
    const category = next.tab ?? active;
    const mode = next.view !== undefined ? next.view : tierView ? 'tier' : undefined;
    const period = next.range !== undefined ? next.range : allTime ? 'all' : undefined;
    if (category !== 'overall') params.set('tab', category);
    if (mode) params.set('view', mode);
    if (period) params.set('range', period);
    const qs = params.toString();
    return qs ? `/hall-of-fame?${qs}` : '/hall-of-fame';
  };

  return (
    <PageShell width="5xl">
      <PageHeader
        slug="hall-of-fame"
        title="명예의 전당"
        desc="문제 풀이, 커뮤니티 기여, 활동 시간 — 디베이트코드를 함께 만들어가는 사람들."
        className="mb-6"
      />

      {/* ---------- 시즌 헤더 ----------
           시즌이 무엇이고 언제 끝나는지를 순위표보다 먼저 알려 준다. 매주 월요일 00:00(KST)에
           구간이 넘어가면서 순위가 자동으로 새로 시작하므로, 남은 시간이 곧 다음 갱신까지다. */}
      <section className="mb-6 border-b border-hairline">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pb-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-600">
              {allTime ? 'ALL TIME' : `SEASON ${season.index}`}
            </p>
            <p className="mt-1 font-display text-lg font-bold tracking-tight text-ink">
              {allTime ? (
                <I18nSlot k="rank-range-all-title" fallback="전체 기간 누적 순위" />
              ) : (
                <>
                  <I18nSlot k="rank-season-title" fallback="이번 시즌 순위" />
                  <span className="ml-2 font-mono text-xs font-normal text-fg-quiet">{seasonRangeLabel(season)}</span>
                </>
              )}
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              {allTime ? (
                <I18nSlot k="rank-range-all-desc" fallback="가입 이후의 모든 활동을 합산합니다." />
              ) : (
                <>
                  <I18nSlot k="rank-season-reset" fallback="매주 월요일 00시에 새 시즌이 시작됩니다" /> ·{' '}
                  <span className="font-medium text-signal">
                    <I18nSlot k="rank-season-remaining" fallback="남은 시간" /> {formatRemaining(remaining)}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* 기간 전환 — 이번 시즌 / 전체 기간 */}
          <div className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-semibold">
            <Link
              href={hrefFor({ range: undefined })}
              aria-current={!allTime ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                !allTime ? 'bg-signal text-white' : 'text-fg-muted hover:text-signal'
              }`}
            >
              <I18nSlot k="rank-range-season" fallback="이번 시즌" />
            </Link>
            <Link
              href={hrefFor({ range: 'all' })}
              aria-current={allTime ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                allTime ? 'bg-signal text-white' : 'text-fg-muted hover:text-signal'
              }`}
            >
              <I18nSlot k="rank-range-all" fallback="전체 기간" />
            </Link>
          </div>
        </div>

        {/* 시즌 진행 바 — 남은 시간을 숫자와 길이 두 가지로 읽게 한다 */}
        {!allTime && (
          <div className="h-1 overflow-hidden rounded-full bg-ink/[0.06]" role="presentation">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-signal transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </section>

      {/* 부문 탭 + 보기 전환 */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="랭킹 부문">
          {TABS.map((t) => {
            const on = t.key === active;
            return (
              <Link
                key={t.key}
                href={hrefFor({ tab: t.key })}
                aria-current={on ? 'page' : undefined}
                className={`shrink-0 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  on
                    ? 'border-signal bg-signal text-white shadow-sm shadow-brand-500/25'
                    : 'border-hairline bg-white text-fg-secondary hover:border-brand-300 hover:text-signal'
                }`}
              >
                <I18nSlot k={`rank-tab-${t.key}`} fallback={t.label} />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-semibold">
          <Link
            href={hrefFor({ view: undefined })}
            aria-current={!tierView ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              !tierView ? 'bg-signal text-white' : 'text-fg-muted hover:text-signal'
            }`}
          >
            <I18nSlot k="rank-view-all" fallback="통합 순위" />
          </Link>
          <Link
            href={hrefFor({ view: 'tier' })}
            aria-current={tierView ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 transition-colors ${
              tierView ? 'bg-signal text-white' : 'text-fg-muted hover:text-signal'
            }`}
          >
            <I18nSlot k="rank-view-tier" fallback="등급별 순위" />
          </Link>
        </div>
      </div>

      <p className="mb-4 text-sm text-fg-muted">
        <I18nSlot k={`rank-desc-${active}`} fallback={meta.desc} />
      </p>

      {/* ---------- 등급별 순위 ---------- */}
      {tierView ? (
        tierGroups.length === 0 ? (
          <EmptyBoard seasonal={!allTime} />
        ) : (
          <div className="space-y-5">
            {/* 높은 등급부터 */}
            {[...tierGroups].reverse().map((group) => (
              <section key={group.tier}>
                <div className="flex flex-wrap items-center gap-3 border-b border-hairline pb-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${RANK_BADGE[group.tier]}`}>
                    {group.tier}
                  </span>
                  <span className="font-mono text-[11px] text-fg-quiet">
                    {group.min.toLocaleString()}
                    {Number.isFinite(group.max) ? `–${group.max.toLocaleString()}` : '+'} P
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-fg-quiet">
                    {group.total}
                    <I18nSlot k="rank-unit-people" fallback="명" />
                  </span>
                </div>
                <ol className="divide-y divide-ink/5">
                  {group.members.map((u, i) => (
                    <li key={u.userId} className="flex items-center gap-3 px-2 py-2.5 transition-colors hover:bg-brand-50/40">
                      <span className="w-6 shrink-0 text-center font-mono text-xs text-fg-quiet">
                        {i < 3 ? MEDALS[i] : i + 1}
                      </span>
                      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-ink/5">
                        <Avatar src={u.avatarUrl} alt={u.name} className="h-full w-full" />
                      </div>
                      <span data-no-translate className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{u.name}</span>
                      <span className="hidden shrink-0 font-mono text-[11px] text-fg-muted sm:inline">
                        {metricsFor(active, u).map((m) => m.value).join(' · ')}
                      </span>
                      <span className="w-16 shrink-0 text-right font-mono text-sm font-semibold text-signal">
                        {u.score.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )
      ) : list.length === 0 ? (
        <EmptyBoard seasonal={!allTime} />
      ) : (
        <>
          {/* ---------- 시상대 (1~3위) ----------
               가운데가 1위가 되도록 sm 이상에서 순서를 2·1·3으로 바꾸고, 높이도 계단으로 준다. */}
          <div className="mb-6 grid items-end gap-4 sm:grid-cols-3">
            {podium.map((u, i) => (
              <article
                key={u.userId}
                className={`relative overflow-hidden p-5 transition ${PODIUM_TONE[i]} ${
                  i === 0 ? 'sm:order-2 sm:pb-7' : i === 1 ? 'sm:order-1' : 'sm:order-3'
                }`}
              >
                {/* 순위 워터마크 — 숫자를 크게 깔아 시상대라는 것을 한눈에 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2 -top-3 font-display text-5xl font-bold text-ink/[0.03]"
                >
                  {i + 1}
                </span>

                <div className="relative flex items-center gap-3">
                  <span className="text-xl" aria-label={`${i + 1}위`}>
                    {MEDALS[i]}
                  </span>
                  <div
                    className={`shrink-0 overflow-hidden rounded-full bg-ink/5 ${
                      i === 0 ? 'h-12 w-12 border-2 border-amber-300/50' : 'h-10 w-10 border-2 border-hairline'
                    }`}
                  >
                    <Avatar src={u.avatarUrl} alt={u.name} className="h-full w-full" />
                  </div>
                  <div className="min-w-0">
                    <p data-no-translate className="flex items-center gap-1.5 truncate font-bold text-ink">
                      {u.name}
                      <RankDelta delta={deltas?.get(u.userId)} />
                    </p>
                    <p className="truncate font-mono text-[11px] text-fg-muted">
                      {u.rankBadgeVisible ? `★ ${u.rankName}` : roleLabel(u.role)}
                    </p>
                  </div>
                </div>

                <p className="relative mt-3 font-display text-2xl font-bold tracking-tight text-signal">
                  {u.score.toLocaleString()}
                  <span className="ml-1 text-sm font-semibold text-fg-muted">{meta.unit}</span>
                </p>

                <dl className="relative mt-3 space-y-1 border-t border-hairline pt-3 text-xs">
                  {metricsFor(active, u).map((m) => (
                    <div key={m.key} className="flex justify-between gap-2">
                      <dt className="text-fg-muted">
                        <I18nSlot k={`rank-metric-${m.key}`} fallback={m.label} />
                      </dt>
                      <dd className="font-mono font-medium text-fg">{m.value}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>

          {/* ---------- 4위 이하 ----------
               테이블 대신 한 줄 카드 리스트. 좁은 화면에서 열이 잘려 나가지 않고,
               점수 막대로 1위와의 거리까지 함께 읽힌다. */}
          {rest.length > 0 && (
            <ol className="border-t border-hairline">
              {rest.map((u, i) => {
                const share = podium[0]?.score ? Math.max(3, Math.round((u.score / podium[0].score) * 100)) : 0;
                return (
                  <li
                    key={u.userId}
                    className="flex items-center gap-3 border-b border-ink/5 px-2 py-3 transition-colors last:border-b-0 hover:bg-brand-50/40 sm:px-3"
                  >
                    <span className="w-7 shrink-0 text-right font-mono text-xs font-semibold text-fg-quiet">
                      {i + 4}
                    </span>
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-ink/5">
                      <Avatar src={u.avatarUrl} alt={u.name} className="h-full w-full" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span data-no-translate className="truncate text-sm font-medium text-ink">{u.name}</span>
                        {u.rankBadgeVisible && (
                          <span className="shrink-0 rounded-full bg-brand-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand-700">
                            ★ {u.rankName}
                          </span>
                        )}
                        <RankDelta delta={deltas?.get(u.userId)} />
                      </div>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-fg-quiet">
                        {metricsFor(active, u)
                          .map((m) => m.value)
                          .join(' · ')}
                      </p>
                    </div>

                    {/* 점수 막대 — 1위 대비 상대 길이. 숫자만으로는 격차가 잘 안 읽힌다 */}
                    <div className="hidden w-28 shrink-0 sm:block" aria-hidden>
                      <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div className="h-full rounded-full bg-signal/70" style={{ width: `${share}%` }} />
                      </div>
                    </div>

                    <span className="w-16 shrink-0 text-right font-mono text-sm font-semibold text-signal">
                      {u.score.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}

      <p className="mt-6 text-center text-[11px] text-fg-quiet">
        <I18nSlot
          k="rank-footnote-season"
          fallback="순위는 페이지를 열 때마다 해당 기간의 활동 기록으로 다시 집계됩니다. 시즌은 매주 월요일 00시(KST)에 바뀌고, 변동(▲▼)은 지난 시즌 순위와 비교한 값입니다."
        />
      </p>
    </PageShell>
  );
}

/** 빈 순위표 — 시즌 보기에서는 "이번 주에 아직"이라는 것을 분명히 한다 */
function EmptyBoard({ seasonal }: { seasonal: boolean }) {
  return (
    <div className="border-t border-hairline px-6 py-20 text-center">
      <p className="text-sm text-fg-muted">
        {seasonal ? (
          <I18nSlot k="rank-empty-season" fallback="이번 시즌에는 아직 집계된 활동이 없습니다. 지금 문제를 풀면 첫 순위에 오릅니다." />
        ) : (
          <I18nSlot k="rank-empty" fallback="아직 집계된 활동이 없습니다. 문제를 풀고 글을 남기면 순위가 만들어집니다." />
        )}
      </p>
      <Link
        href="/problems"
        className="mt-4 inline-block rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
      >
        <I18nSlot k="rank-empty-cta" fallback="문제 풀러 가기" />
      </Link>
    </div>
  );
}
