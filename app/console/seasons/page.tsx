import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { effectivePermissions } from '@/app/lib/permissions-server';
import { getSetting } from '@/app/lib/settings';
import { currentSeason, seasonRangeLabel } from '@/app/lib/season';
import { Callout, EmptyRow, PageHeader, SectionHeader, StatGrid } from '../ui';
import { RankingResetForm, SeasonNumberForm, UserResetForm, UndoResetButton } from './season-actions';

export const metadata: Metadata = { title: '시즌 · 랭킹' };

// 시즌 · 랭킹 운영.
//
// 세 동작이 서로 다르다는 것을 화면에서부터 갈라 놓는다. 한 카드에 몰아넣으면
// "시즌 초기화"를 누르고 순위가 지워졌다고 생각하거나 그 반대의 오해가 생긴다.
const RECENT_RESETS = 30;

async function loadOverview() {
  const [season, floorRaw, resets] = await Promise.all([
    currentSeason(),
    getSetting<string>('ranking.reset_at'),
    prisma.rankingReset.findMany({
      orderBy: { resetAt: 'desc' },
      take: RECENT_RESETS,
      select: {
        id: true,
        reason: true,
        resetAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  const floor = floorRaw.trim() || null;
  return { season, floor, resets };
}

export default async function SeasonsPage() {
  const user = await getUser();
  const { granted } = await effectivePermissions(user.id, user.role);
  if (!granted.has('ranking.manage')) redirect('/console');

  const { season, floor, resets } = await loadOverview();

  return (
    <>
      <PageHeader
        eyebrow="운영"
        title="시즌 · 랭킹"
        sub="시즌 번호와 랭킹 집계 기준을 조정합니다. 활동 기록 자체는 어떤 동작으로도 지워지지 않습니다."
      />

      <StatGrid
        stats={[
          { label: '현재 시즌', value: `S${season.index}` },
          { label: '이번 시즌 구간', value: seasonRangeLabel(season) },
          {
            label: '랭킹 집계 시작',
            value: floor ? new Date(floor).toLocaleDateString('ko-KR') : '제한 없음',
            warn: !!floor,
          },
          { label: '개인 초기화', value: resets.length, warn: resets.length > 0 },
        ]}
      />

      <section className="mt-8">
        <SectionHeader title="시즌 번호" sub="번호만 다시 매깁니다 — 순위는 그대로 남습니다." />
        <div className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
          <SeasonNumberForm currentIndex={season.index} />
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader title="전체 랭킹 초기화" sub="이 시각 이전 활동을 집계에서 뺍니다 — 모두의 순위가 0에서 시작합니다." />
        <div className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
          <Callout tone="warn">
            시즌 초기화와 다릅니다. 시즌 초기화는 <strong>번호만</strong> 다시 매기고, 이 동작은{' '}
            <strong>순위를</strong> 다시 셉니다. 기록은 남으므로 언제든 되돌릴 수 있습니다.
          </Callout>
          <div className="mt-4">
            <RankingResetForm floor={floor} />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader
          title="특정 계정 랭킹 초기화"
          sub="부정행위가 확인된 계정을 이번 집계 구간의 순위에서 제외합니다."
        />
        <div className="rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
          <UserResetForm />

          <div className="mt-5 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {resets.length === 0 ? (
              <EmptyRow text="초기화된 계정이 없습니다." />
            ) : (
              resets.map((reset) => (
                <div key={reset.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 text-sm font-semibold text-ink">{reset.user.name}</span>
                  <span className="min-w-0 truncate font-mono text-[11px] text-fg-quiet">{reset.user.email}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-fg-secondary">{reset.reason}</span>
                  <span className="shrink-0 font-mono text-[10px] text-fg-quiet">
                    {reset.resetAt.toLocaleDateString('ko-KR')}
                  </span>
                  <UndoResetButton id={reset.id} />
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}
