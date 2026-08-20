'use client';

// 상품 목록 + 등록/수정 폼 — 어떤 상품을 편집 중인지가 화면 상태라 클라이언트에 둔다.
// 실제 저장·토글·삭제는 전부 서버 액션이 처리한다.
import { useCallback, useState } from 'react';
import { deleteShopProduct, toggleShopProduct } from '@/app/lib/actions/admin-shop';
import { SHOP_SCOPE_LABELS, type ShopScope } from '@/app/lib/shop-scope';
import { providerLabel } from '@/app/lib/shop';
import ProductForm, { type EditableProduct } from './product-form';

export interface ManagedProduct extends EditableProduct {
  /** 주문이 있으면 삭제 대신 판매 중지만 된다 — 버튼 문구를 그에 맞춘다 */
  orderCount: number;
}

export default function ProductManager({ products }: { products: ManagedProduct[] }) {
  const [editing, setEditing] = useState<EditableProduct | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setEditing(null);
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          등록 {products.length}개 · 노출 {products.filter((p) => p.active).length}개
        </p>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            + 새 상품
          </button>
        )}
      </div>

      {open && <ProductForm editing={editing} onDone={close} />}

      {products.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/15 px-4 py-14 text-center text-sm text-fg-muted">
          등록된 상품이 없습니다. 새 상품을 추가해 보세요.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-hairline bg-white">
          {products.map((product) => (
            <li key={product.id} className="flex flex-wrap items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-paper">
                {product.imageUrl ? (
                  // 외부 이미지 — next/image 도메인 설정 없이 쓰기 위해 img 유지
                  <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full w-full place-items-center font-mono text-[10px] text-fg-quiet">
                    no image
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {product.brand} {product.name}
                </p>
                <p className="font-mono text-[11px] text-fg-muted">
                  {product.priceKrw.toLocaleString()}P · {SHOP_SCOPE_LABELS[product.scope as ShopScope] ?? product.scope} ·{' '}
                  {providerLabel(product.provider)} · 순서 {product.order}
                  {product.stock != null && ` · 재고 ${product.stock}`}
                  {product.orderCount > 0 && ` · 주문 ${product.orderCount}건`}
                </p>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                  product.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-ink/15 bg-paper text-fg-muted'
                }`}
              >
                {product.active ? '노출' : '중지'}
              </span>

              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(product);
                    setOpen(true);
                  }}
                  className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-ink/40"
                >
                  수정
                </button>
                <form action={toggleShopProduct}>
                  <input type="hidden" name="id" value={product.id} />
                  <button className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-ink/40">
                    {product.active ? '중지' : '재개'}
                  </button>
                </form>
                <form
                  action={deleteShopProduct}
                  onSubmit={(e) => {
                    const message =
                      product.orderCount > 0
                        ? '주문 이력이 있어 삭제 대신 판매 중지됩니다. 계속할까요?'
                        : '이 상품을 삭제할까요?';
                    if (!confirm(message)) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="id" value={product.id} />
                  <button className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:border-rose-300 hover:text-rose-600">
                    삭제
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
