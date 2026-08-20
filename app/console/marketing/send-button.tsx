'use client';

// 발송 버튼 — 누르면 바로 나가지 않고 대상 수를 다시 보여 준 뒤 한 번 더 확인받는다.
// 홍보 메일은 회수할 수 없어서, 목록에서 잘못 눌러 나가는 일이 가장 무섭다.
import { useActionState, useState } from 'react';
import { sendCampaign, type CampaignState } from '@/app/lib/actions/admin-marketing';

const initialState: CampaignState = {};

export default function SendButton({
  campaignId,
  subject,
  recipientCount,
}: {
  campaignId: string;
  subject: string;
  recipientCount: number;
}) {
  const [state, formAction, pending] = useActionState(sendCampaign, initialState);
  const [confirming, setConfirming] = useState(false);

  if (state.saved) {
    return <p className="text-[12px] font-medium text-emerald-700">{state.message}</p>;
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="id" value={campaignId} />

      {state.errors?.form && <p className="text-[12px] text-rose-600">{state.errors.form[0]}</p>}

      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-fg-secondary">
            {recipientCount.toLocaleString()}명에게 «{subject}» 발송할까요?
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {pending ? '발송 중…' : '발송'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-xs font-medium text-fg-muted transition-colors hover:text-ink"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-signal px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600"
        >
          발송하기
        </button>
      )}
    </form>
  );
}
