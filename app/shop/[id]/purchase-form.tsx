'use client';

// 교환 신청 — 포인트가 즉시 차감되므로 한 번 확인을 받는다.
// 잘못 눌러 포인트가 빠지면 취소·환불로 되돌릴 수는 있지만, 애초에 묻는 편이 낫다.
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { orderShopProduct, type MateActionState } from '@/app/lib/actions/mate';

const initialState: MateActionState = {};

export default function PurchaseForm({
  productId,
  productLabel,
  disabled,
}: {
  productId: string;
  productLabel: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(orderShopProduct, initialState);
  const [confirming, setConfirming] = useState(false);

  // 접수되면 버튼 대신 결과를 보여 준다 — 연달아 눌러 중복 주문되는 일을 막는다
  if (state.saved) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">교환 신청이 접수되었습니다</p>
        <p className="mt-1 text-[13px] leading-relaxed text-emerald-800/75">
          {state.message ?? '발급이 완료되면 쿠폰 코드가 표시됩니다.'}
        </p>
        <Link
          href="/shop/orders"
          className="mt-3 block w-full rounded-lg bg-emerald-700 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          교환 내역에서 확인
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="productId" value={productId} />

      {state.errors?.form && (
        <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.errors.form[0]}
        </p>
      )}

      {confirming ? (
        <div className="rounded-lg border border-ink/15 bg-paper/60 p-3">
          <p className="text-[13px] leading-relaxed text-ink-soft/75">
            <strong className="text-ink">{productLabel}</strong>을(를) 신청합니다. 포인트가 즉시 차감됩니다.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-lg bg-signal py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {pending ? '신청 중…' : '신청 확정'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-soft/55 transition-colors hover:text-ink"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={disabled}
          className="w-full rounded-lg bg-signal py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-ink-soft/40"
        >
          {disabled ? '신청할 수 없습니다' : '교환 신청하기'}
        </button>
      )}
    </form>
  );
}
