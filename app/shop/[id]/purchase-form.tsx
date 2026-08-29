'use client';

// 교환 신청 — 포인트가 즉시 차감되므로 확인 단계를 둔다.
//
// 연락처를 여기서 받는 이유: 승인 후 발송하는 구조인데, 예전에는 어디로 보낼지 기록이 없어
// 운영자가 이용자에게 따로 물어봐야 했다. 주문 시점에 받아 두면 그 왕복이 사라진다.
import { useActionState, useState } from 'react';
import Link from 'next/link';
import { orderShopProduct, type MateActionState } from '@/app/lib/actions/mate';
import { CONTACT_TYPES, type ContactType } from '@/app/lib/shop-scope';

const initialState: MateActionState = {};

const INPUT =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2 text-sm placeholder:text-fg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

export default function PurchaseForm({
  productId,
  productLabel,
  disabled,
  defaultEmail,
}: {
  productId: string;
  productLabel: string;
  disabled: boolean;
  /** 로그인 계정 이메일 — 이메일 수령을 고르면 기본값으로 채운다 */
  defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(orderShopProduct, initialState);
  const [confirming, setConfirming] = useState(false);
  const [contactType, setContactType] = useState<ContactType>('phone');
  const [contact, setContact] = useState('');

  const meta = CONTACT_TYPES.find((c) => c.value === contactType)!;

  // 접수되면 버튼 대신 결과를 보여 준다 — 연달아 눌러 중복 주문되는 일을 막는다
  if (state.saved) {
    return (
      <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-semibold text-emerald-800">교환 신청이 접수되었습니다</p>
        <p className="mt-1 text-[13px] leading-relaxed text-emerald-800/75">
          {state.message ?? '운영자 승인 후 입력하신 연락처로 발송됩니다.'}
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
    <form action={formAction} className="mt-4 space-y-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="contactType" value={contactType} />

      {state.errors?.form && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {state.errors.form[0]}
        </p>
      )}

      {/* 수령 방법 */}
      <fieldset disabled={disabled}>
        <legend className="mb-1.5 font-mono text-[11px] tracking-wider text-fg-muted">받을 방법</legend>
        <div className="flex gap-1.5">
          {CONTACT_TYPES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setContactType(c.value);
                setContact(c.value === 'email' ? (defaultEmail ?? '') : '');
              }}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                contactType === c.value
                  ? 'border-signal bg-brand-50 text-brand-700'
                  : 'border-hairline text-fg-secondary hover:border-fg-quiet'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          name="contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={meta.placeholder}
          aria-label={meta.label}
          className={`${INPUT} mt-2`}
        />
        <p className="mt-1 text-[11px] text-fg-muted">{meta.hint}</p>
      </fieldset>

      {confirming ? (
        <div className="rounded-lg border border-hairline bg-paper/60 p-3">
          <p className="text-[13px] leading-relaxed text-fg">
            <strong className="text-fg">{productLabel}</strong>을(를) 신청합니다. 포인트가 즉시 차감되고,
            승인 후 <strong className="text-fg">{contact}</strong>(으)로 발송됩니다.
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
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={disabled || contact.trim().length === 0}
          className="w-full rounded-lg bg-signal py-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-ink/15 disabled:text-fg-quiet"
        >
          {disabled ? '신청할 수 없습니다' : contact.trim() ? '교환 신청하기' : '받을 연락처를 입력하세요'}
        </button>
      )}
    </form>
  );
}
