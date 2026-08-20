import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageShell } from '@/app/components/page-shell';
import BackButton from '@/app/components/back-button';
import { prisma } from '@/app/lib/prisma';
import { getSessionOptional } from '@/app/lib/dal';
import { canOrderScope, SHOP_SCOPE_LABELS, asShopScope } from '@/app/lib/shop-scope';
import { getPointSummary } from '@/app/lib/points';
import { POINT_TO_KRW_NOTE, providerLabel } from '@/app/lib/shop';
import PurchaseForm from './purchase-form';

export const metadata: Metadata = { title: '교환 신청' };

export default async function ShopProductPage({ params }: PageProps<'/shop/[id]'>) {
  const { id } = await params;
  const session = await getSessionOptional();

  const [product, summary, viewer] = await Promise.all([
    prisma.shopProduct.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brand: true,
        priceKrw: true,
        imageUrl: true,
        provider: true,
        active: true,
        scope: true,
        description: true,
        stock: true,
      },
    }),
    session ? getPointSummary(session.userId) : null,
    session
      ? prisma.user.findUnique({ where: { id: session.userId }, select: { role: true, email: true } })
      : null,
  ]);
  if (!product) notFound();

  const balance = summary?.balance ?? 0;
  const shortfall = Math.max(0, product.priceKrw - balance);
  // 메이트 전용 상품은 자격이 없으면 신청 버튼 자체를 막는다(서버 액션에서도 다시 검사한다)
  const allowedScope = canOrderScope(viewer?.role ?? 'user', product.scope);
  const soldOut = product.stock != null && product.stock <= 0;

  return (
    <PageShell width="4xl">
      <BackButton label="디베이트샵으로 돌아가기" className="mb-4" />

      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
        {/* ---------- 상품 ---------- */}
        <div className="min-w-0">
          <div className="overflow-hidden rounded-xl border border-hairline bg-paper">
            {product.imageUrl ? (
              // 외부 기프티콘 이미지 — next/image 도메인 설정 없이 쓰기 위해 img 유지
              <img src={product.imageUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] w-full place-items-center bg-gradient-to-br from-brand-100 to-brand-50">
                <span className="font-display text-2xl font-bold text-brand-700/70">{product.brand}</span>
              </div>
            )}
          </div>

          <p className="mt-5 font-mono text-[11px] uppercase tracking-wider text-fg-quiet">{product.brand}</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink">{product.name}</h1>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-signal">{product.priceKrw.toLocaleString()}P</span>
            <span className="font-mono text-sm text-fg-quiet">정가 {product.priceKrw.toLocaleString()}원</span>
          </p>

          <dl className="mt-6 border-t border-hairline text-sm">
            {[
              ['발급 방식', providerLabel(product.provider)],
              ['교환 비율', POINT_TO_KRW_NOTE],
              ['판매 상태', product.active ? '교환 가능' : '판매 중지'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-hairline py-3">
                <dt className="text-fg-muted">{label}</dt>
                <dd className="font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 rounded-xl bg-paper/70 p-4 text-[13px] leading-relaxed text-fg-secondary">
            <p className="mb-1.5 font-semibold text-fg">신청 전 확인해 주세요</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>신청하면 포인트가 즉시 차감되고 <strong>발급 대기</strong> 상태가 됩니다.</li>
              <li>발급이 확정되기 전까지는 주문 내역에서 취소할 수 있고, 취소하면 포인트가 그대로 환불됩니다.</li>
              <li>발급이 완료되면 쿠폰 코드가 주문 내역에 표시됩니다.</li>
              <li>발급에 실패하면 차감된 포인트는 자동으로 환불됩니다.</li>
            </ul>
          </div>
        </div>

        {/* ---------- 신청 ---------- */}
        <aside className="md:sticky md:top-24">
          <div className="rounded-xl border border-hairline bg-white p-5">
            <h2 className="font-display text-lg font-bold tracking-tight text-ink">교환 신청</h2>

            {!session ? (
              <>
                <p className="mt-2 text-sm text-fg-muted">포인트 교환은 로그인 후 이용할 수 있습니다.</p>
                <Link
                  href="/login"
                  className="mt-4 block w-full rounded-lg bg-signal py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-600"
                >
                  로그인
                </Link>
              </>
            ) : (
              <>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-fg-muted">보유 포인트</dt>
                    <dd className="font-mono font-semibold text-ink">{balance.toLocaleString()}P</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-fg-muted">차감 포인트</dt>
                    <dd className="font-mono font-semibold text-rose-600">-{product.priceKrw.toLocaleString()}P</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-hairline pt-2">
                    <dt className="font-medium text-ink">신청 후 잔액</dt>
                    <dd className="font-mono font-bold text-ink">
                      {Math.max(0, balance - product.priceKrw).toLocaleString()}P
                    </dd>
                  </div>
                </dl>

                {shortfall > 0 && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                    {shortfall.toLocaleString()}P가 부족합니다. 활동 인증으로 포인트를 더 모아 보세요.
                  </p>
                )}

                {!allowedScope && (
                  <p className="mt-3 rounded-lg border border-ink/15 bg-paper/60 px-3 py-2 text-[13px] text-fg-secondary">
                    디베이트메이트 전용 상품입니다.
                  </p>
                )}
                {soldOut && (
                  <p className="mt-3 rounded-lg border border-ink/15 bg-paper/60 px-3 py-2 text-[13px] text-fg-secondary">
                    재고가 모두 소진되었습니다.
                  </p>
                )}

                <PurchaseForm
                  productId={product.id}
                  productLabel={`${product.brand} ${product.name}`}
                  disabled={!product.active || shortfall > 0 || !allowedScope || soldOut}
                  defaultEmail={viewer?.email ?? undefined}
                />
              </>
            )}
          </div>

          <Link
            href="/shop/orders"
            className="mt-3 block text-center text-sm font-medium text-fg-muted transition-colors hover:text-signal"
          >
            내 교환 내역 보기 →
          </Link>
        </aside>
      </div>
    </PageShell>
  );
}
