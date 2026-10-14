'use client';

import { useActionState } from 'react';
import { requestPasswordReset, type RequestResetState } from '@/app/lib/actions/auth';

const initialState: RequestResetState = {};

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.sent) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          비밀번호 재설정 링크를 이메일로 보냈습니다. 받은편지함을 확인해 주세요.
          <span className="mt-1 block text-xs text-emerald-700/80">
            링크는 30분간 유효하며 한 번만 쓸 수 있습니다. 메일이 보이지 않으면 스팸함도 확인해 주세요.
          </span>
        </p>

        {/* 메일 발송이 꺼진 개발 환경에서만 나온다 — 운영에서는 devUrl이 채워지지 않는다.
            이 줄이 없으면 로컬에서 재설정 흐름을 끝까지 따라갈 방법이 없다. */}
        {state.devUrl && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs break-all text-amber-900">
            <span className="font-semibold">개발 환경 — 메일 발송이 꺼져 있습니다.</span>
            <a href={state.devUrl} className="mt-1 block font-mono underline">
              {state.devUrl}
            </a>
          </p>
        )}
      </div>
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
          className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm text-fg placeholder:text-fg-quiet focus:outline-none focus:ring-2 focus:ring-signal/60 focus:border-signal"
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
