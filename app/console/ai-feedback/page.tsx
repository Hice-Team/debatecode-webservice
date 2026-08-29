import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { effectivePermissions } from '@/app/lib/permissions-server';
import { findSearchModel } from '@/app/lib/ai/search-models';
import { reasonLabel } from '@/app/lib/ai/feedback-reasons';
import { EmptyState, PageHeader, SectionHeader, SlaBadge, StatGrid } from '../ui';

export const metadata: Metadata = { title: 'AI 피드백' };

// AI Search 답변 평가 — 무엇이 얼마나 잘못 나가고 있는지 한 화면에서 본다.
//
// 신고 큐와 달리 "처리"할 것이 없다. 여기서 필요한 건 처리 상태가 아니라 경향이라서
// 집계(만족도·사유 분포·모델별)를 먼저 놓고, 그 근거가 되는 최근 부정 평가를 아래에 붙였다.
const RECENT_LIMIT = 50;
const ANSWER_PREVIEW = 220;

/**
 * 집계 조회 — 컴포넌트 밖에 둔다.
 * 렌더 중 `Date.now()`를 부르면 순수성 규칙에 걸린다(react-hooks/purity).
 */
async function loadOverview() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [up, down, recent7d, recent] = await Promise.all([
    prisma.aiFeedback.count({ where: { rating: 'up' } }),
    prisma.aiFeedback.count({ where: { rating: 'down' } }),
    prisma.aiFeedback.count({ where: { createdAt: { gte: since7d } } }),
    prisma.aiFeedback.findMany({
      where: { rating: 'down' },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: {
        id: true,
        reasons: true,
        comment: true,
        model: true,
        createdAt: true,
        user: { select: { name: true } },
        message: { select: { content: true } },
      },
    }),
  ]);

  return { up, down, recent7d, recent };
}

export default async function AiFeedbackPage() {
  const user = await getUser();
  const { granted } = await effectivePermissions(user.id, user.role);
  if (!granted.has('feedback.read')) redirect('/console');

  const { up, down, recent7d, recent } = await loadOverview();

  const total = up + down;
  const satisfaction = total > 0 ? Math.round((up / total) * 100) : null;

  // 사유 분포 — 최근 부정 평가에서 센다(전수 집계는 JSON 배열이라 SQL로 세기 어렵다).
  const reasonCounts = new Map<string, number>();
  for (const item of recent) {
    for (const reason of (item.reasons as unknown as string[]) ?? []) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <>
      <PageHeader
        eyebrow="품질"
        title="AI 피드백"
        sub="AI Search 답변에 이용자가 남긴 평가입니다. 처리할 큐가 아니라 경향을 보는 화면입니다."
      />

      <StatGrid
        stats={[
          { label: '전체 평가', value: total },
          {
            label: '만족도',
            value: satisfaction === null ? '—' : `${satisfaction}%`,
            warn: satisfaction !== null && satisfaction < 60,
            sub: total > 0 ? `👍 ${up} · 👎 ${down}` : '아직 평가가 없습니다',
          },
          { label: '최근 7일', value: recent7d },
          { label: '부정 평가', value: down, warn: down > up },
        ]}
      />

      {topReasons.length > 0 && (
        <section className="mt-8">
          <SectionHeader title="자주 나오는 사유" sub={`최근 부정 평가 ${recent.length}건 기준`} />
          <div className="flex flex-wrap gap-2">
            {topReasons.map(([reason, count]) => (
              <span
                key={reason}
                className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-[13px] text-fg"
              >
                {reasonLabel(reason, 'ko')}
                <span className="ml-1.5 font-mono text-[11px] font-semibold text-rose-600">{count}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionHeader title="최근 부정 평가" sub="어떤 답변이 왜 낮은 평가를 받았는지 확인합니다." />
        <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          {recent.length === 0 ? (
            <EmptyState title="부정 평가가 없습니다" sub="이용자가 👎를 누르면 여기에 쌓입니다." />
          ) : (
            recent.map((item) => {
              const reasons = (item.reasons as unknown as string[]) ?? [];
              const model = item.model ? findSearchModel(item.model) : null;
              return (
                <article key={item.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
                      {item.user.name}
                    </span>
                    {model && (
                      <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 font-mono text-[10px] text-fg-muted">
                        {model.label}
                      </span>
                    )}
                    <SlaBadge since={item.createdAt} done />
                  </div>

                  {reasons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {reasons.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700"
                        >
                          {reasonLabel(reason, 'ko')}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.comment && (
                    <p className="mt-2 rounded-xl bg-paper px-3 py-2 text-[13px] leading-relaxed text-fg">
                      {item.comment}
                    </p>
                  )}

                  <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-fg-muted">
                    {item.message.content.slice(0, ANSWER_PREVIEW)}
                    {item.message.content.length > ANSWER_PREVIEW && '…'}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}
