import Link from 'next/link';
import type { Metadata } from 'next';
import ResetPasswordForm from './reset-password-form';

export const metadata: Metadata = { title: '비밀번호 재설정' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const { token, email } = await searchParams;
  const hasLink = typeof token === 'string' && typeof email === 'string' && token.length > 20;

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">RESET PASSWORD</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-fg"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {hasLink ? '새 비밀번호를 설정하세요' : '링크를 다시 받아 주세요'}
          </h1>
        </div>

        <div className="rounded-xl border border-hairline bg-surface p-8 shadow-sm">
          {hasLink ? (
            <ResetPasswordForm token={token} email={email} />
          ) : (
            // 주소로 바로 들어왔거나 링크가 잘린 경우 — 빈 폼을 띄우면
            // 비밀번호를 입력하고 나서야 안 된다는 것을 알게 된다.
            <div className="space-y-4 text-center">
              <p className="text-sm leading-relaxed text-fg-secondary">
                이 화면은 메일로 받은 재설정 링크로만 열 수 있습니다.
                <br />
                링크가 만료됐다면 다시 요청해 주세요.
              </p>
              <Link
                href="/forgot-password"
                className="inline-flex min-h-11 items-center rounded-full bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
              >
                재설정 링크 다시 받기
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
