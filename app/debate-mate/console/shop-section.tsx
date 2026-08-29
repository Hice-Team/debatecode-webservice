// 디베이트샵 안내 — 상점 자체는 /shop에 따로 있다.
//
// 예전에는 이 콘솔 안에 상품 그리드와 주문 폼이 통째로 들어 있었다. 상점은 메이트만 쓰는 것이
// 아니고 포인트가 있는 누구나 쓰는 화면이라, 진열과 신청은 /shop으로 옮기고 여기서는
// "지금 얼마가 있고, 진행 중인 교환이 몇 건인지"만 알린다.
import Link from 'next/link';
import { ORDER_STATUS_LABELS, POINT_TO_KRW_NOTE } from '@/app/lib/shop';

interface Order {
  id: string;
  pointsSpent: number;
  status: string;
  couponCode: string | null;
  createdAt: Date;
  product: { name: string; brand: string };
}

export default function ShopSection({
  orders,
  balance,
}: {
  orders: Order[];
  balance: number;
}) {
  const pending = orders.filter((o) => o.status === 'requested').length;

  return (
    <section className="mt-6 rounded-[var(--radius-panel)] border border-hairline bg-surface" aria-labelledby="shop-title">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
        <div className="min-w-0">
          <h2 id="shop-title" className="font-bold text-fg">
            디베이트샵
          </h2>
          <p className="mt-0.5 text-xs text-fg-muted">{POINT_TO_KRW_NOTE} · 모은 포인트로 기프티콘을 교환하세요.</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 font-mono text-xs font-semibold text-brand-700">
          보유 {balance.toLocaleString()}P
        </span>
      </div>

      {/* 상점은 아직 열리지 않았다.
          "교환 가능한 상품 0개"는 재고가 없다는 뜻으로 읽히고, "상점 열기"를 누르면
          빈 화면이 나온다 — 무엇이 없는 상태인지 그대로 말하고 버튼은 잠근다. */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <p className="flex items-start gap-2 text-sm text-fg-secondary">
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
          <span>
            디베이트포인트샵은 정식 오픈 준비 중입니다. 포인트는 지금도 정상 적립됩니다.
            {pending > 0 && (
              <>
                {' '}
                발급 대기 <strong className="text-amber-700">{pending}</strong>건은 오픈 후 순서대로 처리합니다.
              </>
            )}
          </span>
        </p>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {orders.length > 0 && (
            <Link
              href="/shop/orders"
              className="rounded-lg border border-hairline px-3.5 py-2 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-quiet"
            >
              교환 내역
            </Link>
          )}
          <span
            aria-disabled="true"
            title="정식 오픈 준비 중입니다"
            className="cursor-not-allowed rounded-lg bg-paper px-4 py-2 text-sm font-semibold text-fg-quiet"
          >
            준비 중
          </span>
        </div>
      </div>

      {/* 최근 교환 두 건만 — 자세한 내역은 /shop/orders에 있다 */}
      {orders.length > 0 && (
        <ul className="border-t border-hairline px-5 py-3">
          {orders.slice(0, 2).map((order) => (
            <li key={order.id} className="flex items-center gap-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-fg">
                {order.product.brand} {order.product.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] text-fg-muted">
                {ORDER_STATUS_LABELS[order.status] ?? order.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
