import Link from 'next/link';
import type { Metadata } from 'next';
import ForgotPasswordForm from './forgot-password-form';

export const metadata: Metadata = { title: '비밀번호 찾기' };

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">FORGOT PASSWORD</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-ink-soft"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            비밀번호를 재설정하세요
          </h1>
        </div>

        <div className="bg-white rounded-xl border border-hairline shadow-sm p-8">
          <ForgotPasswordForm />
        </div>

        <p className="mt-6 text-center text-sm text-fg-secondary">
          <Link href="/login" className="font-semibold text-ink-soft underline underline-offset-4 hover:text-signal transition-colors">
            로그인으로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
