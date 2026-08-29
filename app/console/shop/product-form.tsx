'use client';

// 상품 등록·수정 폼 — 목록에서 "수정"을 누르면 그 상품 값으로 열린다.
// 등록과 수정이 같은 폼을 쓰므로 id의 유무만으로 갈린다(서버 액션도 같은 기준).
import { useActionState, useEffect, useState } from 'react';
import { saveShopProduct, type ShopAdminState } from '@/app/lib/actions/admin-shop';
import { SHOP_PROVIDERS } from '@/app/lib/shop';
import { SHOP_SCOPES, SHOP_SCOPE_LABELS, SHOP_SCOPE_DESC, type ShopScope } from '@/app/lib/shop-scope';

const initialState: ShopAdminState = {};

export interface EditableProduct {
  id: string;
  name: string;
  brand: string;
  priceKrw: number;
  imageUrl: string | null;
  provider: string;
  providerSku: string | null;
  order: number;
  active: boolean;
  scope: string;
  description: string | null;
  stock: number | null;
}

const LABEL = 'block font-mono text-[11px] uppercase tracking-wider text-fg-muted mb-1.5';
const FIELD =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm placeholder:text-fg-quiet focus:border-signal/40 focus:outline-none focus:ring-2 focus:ring-signal/30';

export default function ProductForm({ editing, onDone }: { editing: EditableProduct | null; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(saveShopProduct, initialState);
  const [imageUrl, setImageUrl] = useState(editing?.imageUrl ?? '');
  const [scope, setScope] = useState<ShopScope>((editing?.scope as ShopScope) ?? 'general');

  // 저장에 성공하면 폼을 닫는다 — 목록은 서버가 새로 그려 준다
  useEffect(() => {
    if (state.saved) onDone();
  }, [state.saved, onDone]);

  return (
    <form action={formAction} key={editing?.id ?? 'new'} className="rounded-xl border border-hairline bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-fg">{editing ? '상품 수정' : '새 상품 등록'}</h3>
        <button type="button" onClick={onDone} className="text-sm text-fg-muted transition-colors hover:text-fg">
          닫기
        </button>
      </div>

      {editing && <input type="hidden" name="id" value={editing.id} />}

      {/* 어느 상점에 걸릴지 — 카탈로그만 다르고 구매 흐름은 같다 */}
      <fieldset className="mb-4">
        <legend className={LABEL}>상점 구분</legend>
        <div className="flex gap-2">
          {SHOP_SCOPES.map((sc: ShopScope) => (
            <label
              key={sc}
              className={`flex flex-1 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                scope === sc ? 'border-signal bg-brand-50/50' : 'border-hairline hover:border-fg-quiet'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value={sc}
                checked={scope === sc}
                onChange={() => setScope(sc)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-signal)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{SHOP_SCOPE_LABELS[sc]}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">{SHOP_SCOPE_DESC[sc]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="brand" className={LABEL}>
            브랜드
          </label>
          <input id="brand" name="brand" required maxLength={40} defaultValue={editing?.brand ?? ''} placeholder="스타벅스" className={FIELD} />
        </div>
        <div>
          <label htmlFor="name" className={LABEL}>
            상품명
          </label>
          <input id="name" name="name" required maxLength={80} defaultValue={editing?.name ?? ''} placeholder="아메리카노 T" className={FIELD} />
        </div>
        <div>
          <label htmlFor="priceKrw" className={LABEL}>
            필요 포인트 (= 정가 원)
          </label>
          <input
            id="priceKrw"
            name="priceKrw"
            type="number"
            required
            min={100}
            max={1000000}
            step={100}
            defaultValue={editing?.priceKrw ?? 4500}
            className={`${FIELD} font-mono`}
          />
        </div>
        <div>
          <label htmlFor="order" className={LABEL}>
            진열 순서 (작을수록 앞)
          </label>
          <input id="order" name="order" type="number" min={0} max={999} defaultValue={editing?.order ?? 0} className={`${FIELD} font-mono`} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="imageUrl" className={LABEL}>
            이미지 주소 (http/https)
          </label>
          <input
            id="imageUrl"
            name="imageUrl"
            type="url"
            maxLength={500}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className={FIELD}
          />
          {/* 붙여넣은 주소가 실제로 그려지는지 여기서 바로 확인한다 */}
          {imageUrl && /^https?:\/\//i.test(imageUrl) && (
            // 외부 이미지 — next/image 도메인 설정 없이 미리보기만 한다
            <img src={imageUrl} alt="" className="mt-2 h-24 w-32 rounded-lg border border-hairline object-cover" />
          )}
        </div>

        <div>
          <label htmlFor="provider" className={LABEL}>
            발급 채널
          </label>
          <select id="provider" name="provider" defaultValue={editing?.provider ?? 'manual'} className={FIELD}>
            {SHOP_PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="providerSku" className={LABEL}>
            채널 상품코드 (선택)
          </label>
          <input id="providerSku" name="providerSku" maxLength={80} defaultValue={editing?.providerSku ?? ''} className={`${FIELD} font-mono`} />
        </div>
        <div>
          <label htmlFor="stock" className={LABEL}>
            재고 (비우면 무제한)
          </label>
          <input
            id="stock"
            name="stock"
            type="number"
            min={0}
            max={100000}
            defaultValue={editing?.stock ?? ''}
            placeholder="무제한"
            className={`${FIELD} font-mono`}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="description" className={LABEL}>
            상품 설명 (선택)
          </label>
          <input
            id="description"
            name="description"
            maxLength={300}
            defaultValue={editing?.description ?? ''}
            placeholder="예: 전국 매장에서 사용 가능 · 유효기간 발급일로부터 3개월"
            className={FIELD}
          />
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-fg">
        <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} className="h-4 w-4 accent-[var(--color-signal)]" />
        지금 상점에 노출
      </label>

      {state.errors?.form && (
        <div className="mt-3 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.errors.form.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
      >
        {pending ? '저장 중…' : editing ? '수정 저장' : '상품 등록'}
      </button>
    </form>
  );
}
