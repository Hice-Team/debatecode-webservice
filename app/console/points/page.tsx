import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canReview } from '@/app/lib/roles';
import { platformLabel } from '@/app/community/boards';
import { POINT_KIND_LABELS } from '@/app/lib/points';
import { reviewPointRequest } from '@/app/lib/actions/admin-points';
import { PageHeader, SectionHeader, BTN_APPROVE, BTN_REJECT, EmptyRow } from '../ui';
import PointGrantForm, { type GrantTarget } from './grant-form';
import { maskName } from '@/app/lib/privacy';
import { roleLabel } from '@/app/lib/roles';

export const metadata: Metadata = { title: '포인트 심사' };

export default async function ConsolePointsPage() {
  const user = await getUser();
  if (!canReview(user.role)) redirect('/console');

  const [pendingRequests, reviewedRequests, recentLedger] = await Promise.all([
    prisma.pointRequest.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.pointRequest.findMany({
      where: { status: { not: 'pending' } },
      orderBy: { reviewedAt: 'desc' },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.pointLedger.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { user: { select: { name: true } } },
    }),
  ]);

  // 포인트가 전 회원에게 열렸으므로 지급 대상도 메이트로 좁히지 않는다.
  // 잔액은 원장 합계라 한 번에 집계해 붙인다.
  const [members, ledgerSums] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 300,
      select: { id: true, name: true, role: true },
    }),
    prisma.pointLedger.groupBy({ by: ['userId'], _sum: { amount: true } }),
  ]);
  const balanceByUser = new Map(ledgerSums.map((r) => [r.userId, r._sum.amount ?? 0]));
  const grantTargets: GrantTarget[] = members.map((m) => ({
    id: m.id,
    name: maskName(m.name),
    role: roleLabel(m.role),
    balance: balanceByUser.get(m.id) ?? 0,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Points"
        title="포인트 심사"
        sub="활동 인증 신청을 검토하고 포인트를 지급합니다."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: '심사 대기', value: pendingRequests.length, warn: pendingRequests.length > 0 },
          { label: '최근 원장', value: recentLedger.length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-[var(--radius-panel)] border border-hairline bg-surface px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{stat.label}</p>
            <p className={`mt-1 font-display text-2xl font-bold ${stat.warn ? 'text-rose-600' : 'text-fg'}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 활동 인증 심사 */}
      <section className="mb-8 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
        <div className="border-b border-hairline px-5 py-3">
          <h3 className="font-bold text-fg">활동 인증 신청</h3>
        </div>
        {pendingRequests.length === 0 ? (
          <EmptyRow text="심사 대기 중인 신청이 없습니다." />
        ) : (
          <ul className="divide-y divide-hairline">
            {pendingRequests.map((request) => {
              const payload = request.payload as { title?: string; url?: string; platform?: string; description?: string };
              return (
                <li key={request.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-fg">{request.user.name}</span>
                    <span className="font-mono text-[11px] text-fg-quiet">{request.user.email}</span>
                    <span className="ml-auto rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-signal">
                      +{request.amount}P
                    </span>
                  </div>

                  <div className="mt-2 rounded-[var(--radius-panel)] border border-hairline bg-paper/50 p-3 text-sm">
                    <p className="font-medium text-fg">{payload?.title ?? '제목 없음'}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-fg-muted">{platformLabel(payload?.platform)}</p>
                    {payload?.url && (
                      <a
                        href={payload.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block break-all font-mono text-[11px] text-signal hover:underline"
                      >
                        {payload.url} ↗
                      </a>
                    )}
                    {payload?.description && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-fg-secondary">{payload.description}</p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
                    <form action={reviewPointRequest} className="flex flex-1 items-start gap-2">
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="action" value="reject" />
                      <input
                        name="note"
                        placeholder="반려 사유 (선택)"
                        className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-hairline px-3 py-1.5 text-xs focus:border-signal focus:outline-none"
                      />
                      <button type="submit" className={BTN_REJECT}>
                        반려
                      </button>
                    </form>
                    <form action={reviewPointRequest} className="shrink-0">
                      <input type="hidden" name="id" value={request.id} />
                      <input type="hidden" name="action" value="approve" />
                      <button type="submit" className={BTN_APPROVE}>
                        승인 · +{request.amount}P 지급
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>


      <div className="grid gap-6 lg:grid-cols-2">
        {/* 최근 심사 결과 */}
        <section className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          <div className="border-b border-hairline px-5 py-3">
            <h3 className="font-bold text-fg">최근 심사</h3>
          </div>
          {reviewedRequests.length === 0 ? (
            <EmptyRow text="심사 이력이 없습니다." />
          ) : (
            <ul className="divide-y divide-hairline">
              {reviewedRequests.map((request) => (
                <li key={request.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {request.user.name} · {(request.payload as { title?: string })?.title ?? 'SNS 홍보'}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      request.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {request.status === 'approved' ? '승인' : '반려'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 원장 최근 기록 */}
        <section className="overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          <div className="border-b border-hairline px-5 py-3">
            <h3 className="font-bold text-fg">최근 포인트 원장</h3>
          </div>
          {recentLedger.length === 0 ? (
            <EmptyRow text="원장 기록이 없습니다." />
          ) : (
            <ul className="divide-y divide-hairline">
              {recentLedger.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-12 shrink-0 font-mono text-[11px] text-fg-quiet">
                    {new Date(entry.createdAt).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">
                    {entry.user.name} · {entry.memo ?? POINT_KIND_LABELS[entry.kind] ?? entry.kind}
                  </span>
                  <span className={`shrink-0 font-mono text-sm font-semibold ${entry.amount > 0 ? 'text-emerald-600' : 'text-fg-secondary'}`}>
                    {entry.amount > 0 ? '+' : ''}
                    {entry.amount.toLocaleString()}P
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 운영자 수동 지급 — 자동 규칙으로 처리할 수 없는 보정·보상용 */}
      <div className="mt-10">
        <SectionHeader
          title="포인트 수동 지급·차감"
          sub="발급 실패 환급, 이벤트 보상, 잘못 지급된 포인트 회수에 씁니다. 사유는 원장과 감사 로그에 남습니다."
        />
        <PointGrantForm targets={grantTargets} />
      </div>
    </>
  );
}
