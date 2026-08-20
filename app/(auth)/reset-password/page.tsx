import Link from 'next/link';
import type { Metadata } from 'next';
import ResetPasswordForm from './reset-password-form';

export const metadata: Metadata = { title: '비밀번호 재설정' };

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">RESET PASSWORD</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-ink-soft"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            새 비밀번호를 설정하세요
          </h1>
        </div>

        <div className="bg-white rounded-xl border border-hairline shadow-sm p-8">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  );
}
