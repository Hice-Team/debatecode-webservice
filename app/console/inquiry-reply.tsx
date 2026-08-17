'use client';

// 문의 답변 폼 — 답변 저장 시 status=answered.
import { useActionState } from 'react';
import { answerInquiry, type InquiryReplyState } from '@/app/lib/actions/admin';

const initial: InquiryReplyState = {};

export default function InquiryReply({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(answerInquiry, initial);

  if (state.saved) return <p className="text-xs text-emerald-600">답변이 저장되었습니다.</p>;

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="id" value={id} />
      <textarea
        name="answer"
        rows={2}
        required
        placeholder="답변 작성…"
        className="w-full rounded-lg border border-ink/15 bg-paper/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal/50"
      />
      {state.errors?.answer && <p className="text-xs text-rose-600">{state.errors.answer[0]}</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-50">
        {pending ? '저장 중…' : '답변 저장'}
      </button>
    </form>
  );
}
