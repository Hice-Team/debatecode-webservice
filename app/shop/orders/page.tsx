import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { verifySession } from '@/app/lib/dal';
import { getPointSummary } from '@/app/lib/points';
import { cancelShopOrder } from '@/app/lib/actions/mate';
import { ORDER_STATUS_LABELS, ORDER_STATUS_TONES } from '@/app/lib/shop';

export const metadata: Metadata = { title: '교환 내역' };

export default async function ShopOrdersPage() {
  const { userId } = await verifySession();

  const [orders, summary] = await Promise.all([
    prisma.shopOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        pointsSpent: true,
        couponCode: true,
        couponExpiresAt: true,
        failureReason: true,
        createdAt: true,
        product: { select: { name: true, brand: true } },
      },
    }),
    getPointSummary(userId),
  ]);

  return (
    <PageShell width="4xl">
      <BackButton label="디베이트샵으로 돌아가기" className="mb-4" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">MY ORDERS</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">교환 내역</h1>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">보유 포인트</p>
          <p className="font-display text-xl font-bold text-signal">{summary.balance.toLocaleString()}P</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="mt-8 border-t border-hairline py-20 text-center">
          <p className="text-sm text-fg-muted">아직 교환한 상품이 없습니다.</p>
          <Link
            href="/shop"
            className="mt-4 inline-block rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            상품 보러 가기
          </Link>
        </div>
      ) : (
        <ul className="mt-6 border-t border-hairline">
          {orders.map((order) => (
            <li key={order.id} className="border-b border-hairline py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {order.product.brand} {order.product.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-fg-quiet">
                    {order.createdAt.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
                    {order.pointsSpent.toLocaleString()}P
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    ORDER_STATUS_TONES[order.status] ?? 'border-ink/15 bg-paper text-fg-muted'
                  }`}
                >
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>

                {/* 발급 전에는 직접 취소할 수 있다 — 취소하면 포인트가 그대로 돌아온다 */}
                {order.status === 'requested' && (
                  <form action={cancelShopOrder} className="shrink-0">
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-rose-300 hover:text-rose-600">
                      취소
                    </button>
                  </form>
                )}
              </div>

              {order.couponCode && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-700/70">쿠폰 코드</span>
                  <code className="font-mono text-sm font-bold text-emerald-800">{order.couponCode}</code>
                  {order.couponExpiresAt && (
                    <span className="ml-auto font-mono text-[11px] text-emerald-700/60">
                      {order.couponExpiresAt.toLocaleDateString('ko-KR')}까지
                    </span>
                  )}
                </div>
              )}

              {order.failureReason && (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                  {order.failureReason} · 차감된 포인트는 환불되었습니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
