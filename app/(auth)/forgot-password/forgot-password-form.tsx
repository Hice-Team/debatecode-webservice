'use client';

import { useActionState } from 'react';
import { requestPasswordReset, type RequestResetState } from '@/app/lib/actions/auth';

const initialState: RequestResetState = {};

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.sent) {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
        비밀번호 재설정 링크를 이메일로 보냈습니다. 받은편지함을 확인해 주세요.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="email" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">
          EMAIL
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm text-ink-soft placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/60 focus:border-signal"
        />
        {state.errors?.email && <p className="mt-1.5 text-xs text-rose-600">{state.errors.email[0]}</p>}
      </div>

      {state.errors?.form && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
          {state.errors.form[0]}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 text-white font-semibold py-3 hover:bg-brand-500 transition-colors disabled:opacity-50"
      >
        {pending ? '전송 중…' : '재설정 링크 보내기'}
      </button>
    </form>
  );
}
