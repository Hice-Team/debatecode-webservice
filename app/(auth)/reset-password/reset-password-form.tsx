'use client';

import { useActionState } from 'react';
import { updatePassword, type UpdatePasswordState } from '@/app/lib/actions/auth';

const initialState: UpdatePasswordState = {};

export default function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="password" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">
          NEW PASSWORD
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="영문 + 숫자, 8자 이상"
          className="w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm text-ink-soft placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/60 focus:border-signal"
        />
        {state.errors?.password && <p className="mt-1.5 text-xs text-rose-600">{state.errors.password[0]}</p>}
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
        {pending ? '변경 중…' : '비밀번호 변경'}
      </button>
    </form>
  );
}
