'use client';

import { useActionState } from 'react';
import { updatePassword, type UpdatePasswordState } from '@/app/lib/actions/auth';
import Link from 'next/link';

const initialState: UpdatePasswordState = {};

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    <div className="pt-4">
      <h2 className="text-lg font-semibold">새 비밀번호 설정</h2>
      <p className="mt-2 text-sm text-fg-secondary">새로운 비밀번호를 입력하세요. 변경 완료 후 설정 화면으로 돌아갑니다.</p>
      <form action={formAction} className="mt-4 space-y-4">
        <div>
          <label htmlFor="password" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">NEW PASSWORD</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="영문 + 숫자, 8자 이상"
            className="w-full rounded-lg border border-hairline bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60"
          />
          {state.errors?.password && <p className="mt-1.5 text-xs text-rose-600">{state.errors.password[0]}</p>}
        </div>
        {state.errors?.form && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">{state.errors.form[0]}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50">{pending ? '변경 중…' : '비밀번호 변경'}</button>
          <Link href="/settings" className="text-sm text-fg-secondary hover:text-fg">취소</Link>
        </div>
      </form>
    </div>
  );
}
