'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

export default function PasswordForm({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  /**
   * 비밀번호 변경 제출.
   *
   * 폼의 `method="post"`는 하이드레이션 전 제출을 막기 위한 것이다 — 없으면 브라우저가
   * GET으로 보내 새 비밀번호가 주소창에 붙는다(app/(auth)/login/login-form.tsx 참고).
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget as HTMLFormElement);
    const current = String(form.get('current') ?? '');
    if (!current) {
      setError('현재 비밀번호를 입력해 주세요.');
      setPending(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: current });
      if (error) {
        setError('현재 비밀번호가 일치하지 않습니다.');
        setPending(false);
        return;
      }
      // 인증 성공 — 변경 페이지로 이동
      router.push('/settings/account/change-password');
    } catch {
      setError('인증 중 오류가 발생했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} method="post" className="space-y-4">
      <div>
        <label htmlFor="current" className="block font-mono text-xs text-fg-secondary tracking-wider mb-1.5">현재 비밀번호</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required placeholder="현재 비밀번호" className="w-full rounded-lg border border-ink/15 bg-paper/50 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal/60" />
        {error && <p className="mt-1.5 text-xs text-rose-600">{error}</p>}
      </div>
      <button type="submit" disabled={pending} className="px-6 py-3 bg-brand-600 text-white font-semibold rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50">
        {pending ? '확인 중…' : '확인하고 변경하기'}
      </button>
    </form>
  );
}
