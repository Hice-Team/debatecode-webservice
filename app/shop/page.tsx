import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/app/components/page-shell';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { getPointSummary } from '@/app/lib/points';
import { ORDER_STATUS_LABELS } from '@/app/lib/shop';

export const metadata: Metadata = { title: '디베이트샵' };

// 브랜드별 색 — 이미지가 없는 상품도 카드가 비어 보이지 않게 한다
const BRAND_TONES = [
  'from-brand-100 to-brand-50 text-brand-700',
  'from-emerald-100 to-emerald-50 text-emerald-700',
  'from-amber-100 to-amber-50 text-amber-700',
  'from-sky-100 to-sky-50 text-sky-700',
  'from-rose-100 to-rose-50 text-rose-700',
];

function brandTone(brand: string): string {
  let hash = 0;
  for (const ch of brand) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return BRAND_TONES[Math.abs(hash) % BRAND_TONES.length];
}

export default async function ShopPage() {
  const session = await getSessionOptional();

  const [products, summary, recentOrders] = await Promise.all([
    prisma.shopProduct.findMany({
      where: { active: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, brand: true, priceKrw: true, imageUrl: true },
    }),
    session ? getPointSummary(session.userId) : null,
    session
      ? prisma.shopOrder.findMany({
          where: { userId: session.userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            pointsSpent: true,
            couponCode: true,
            createdAt: true,
            product: { select: { name: true, brand: true } },
          },
        })
      : [],
  ]);

  const balance = summary?.balance ?? 0;

  return (
    <PageShell width="5xl">
      {/* ---------- 상점 머리말 ---------- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">DEBATE SHOP</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-ink">디베이트샵</h1>
          <p className="mt-1 text-sm text-ink-soft/55">모은 포인트로 기프티콘을 교환하세요. 1,000P = 1,000원</p>
        </div>

        {session ? (
          <div className="shrink-0 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-right">
            <p className="font-mono text-[10px] uppercase tracking-wider text-brand-700/70">보유 포인트</p>
            <p className="font-display text-xl font-bold text-brand-800">{balance.toLocaleString()}P</p>
            {summary && summary.reserved > 0 && (
              <p className="font-mono text-[10px] text-brand-700/60">발급 대기 {summary.reserved.toLocaleString()}P</p>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="shrink-0 rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            로그인하고 교환하기
          </Link>
        )}
      </header>

      {/* ---------- 상품 진열 ---------- */}
      <section className="mt-8">
        <h2 className="border-b border-ink/10 pb-3 font-display text-lg font-bold tracking-tight text-ink">
          교환 가능한 상품
          <span className="ml-1.5 font-mono text-xs font-normal text-ink-soft/35">{products.length}</span>
        </h2>

        {products.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-ink/15 px-4 py-16 text-center text-sm text-ink-soft/45">
            현재 교환 가능한 상품이 없습니다. 곧 새로운 상품이 등록됩니다.
          </p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const affordable = !session || balance >= product.priceKrw;
              return (
                <li key={product.id}>
                  <Link
                    href={`/shop/${product.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-ink/10 bg-white transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-ink/5"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                      {product.imageUrl ? (
                        // 외부 기프티콘 이미지 — next/image 도메인 설정 없이 쓰기 위해 img 유지
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className={`grid h-full w-full place-items-center bg-gradient-to-br ${brandTone(product.brand)}`}>
                          <span className="font-display text-lg font-bold opacity-70">{product.brand}</span>
                        </div>
                      )}
                      {session && !affordable && (
                        <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 font-mono text-[10px] font-semibold text-white">
                          포인트 부족
                        </span>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-4">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft/40">{product.brand}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-ink group-hover:text-signal">
                        {product.name}
                      </p>
                      <div className="mt-auto flex items-baseline gap-1.5 pt-3">
                        <span className="font-display text-lg font-bold text-signal">
                          {product.priceKrw.toLocaleString()}P
                        </span>
                        <span className="font-mono text-[11px] text-ink-soft/35">
                          {product.priceKrw.toLocaleString()}원
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- 최근 교환 내역 ---------- */}
      {session && recentOrders.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between border-b border-ink/10 pb-3">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">최근 교환 내역</h2>
            <Link href="/shop/orders" className="text-sm font-medium text-signal hover:underline">
              전체 보기 →
            </Link>
          </div>
          <ul className="mt-1">
            {recentOrders.map((order) => (
              <li key={order.id} className="flex items-center gap-3 border-b border-ink/[0.07] py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {order.product.brand} {order.product.name}
                  </p>
                  <p className="font-mono text-[11px] text-ink-soft/40">
                    {order.createdAt.toLocaleDateString('ko-KR')} · {order.pointsSpent.toLocaleString()}P
                  </p>
                </div>
                {order.couponCode && (
                  <code className="shrink-0 rounded bg-emerald-50 px-2 py-1 font-mono text-[11px] text-emerald-700">
                    {order.couponCode}
                  </code>
                )}
                <span className="shrink-0 font-mono text-[11px] text-ink-soft/50">
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}
