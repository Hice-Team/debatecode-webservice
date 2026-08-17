import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import LoginForm from './login-form';
import { getSessionOptional } from '@/app/lib/dal';

export const metadata: Metadata = { title: '로그인' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  // 이미 로그인한 사용자는 대시보드로 (proxy.ts가 하던 최적화 리다이렉트를 대체).
  if (await getSessionOptional()) redirect('/dashboard');

  const { oauthError } = await searchParams;
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">WELCOME BACK</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-ink-soft"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            다시 논증할 시간입니다
          </h1>
        </div>

        <div className="bg-white rounded-xl border border-ink/10 shadow-sm p-8">
          <LoginForm oauthError={typeof oauthError === 'string' ? oauthError : undefined} />
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft/60">
          아직 계정이 없나요?{' '}
          <Link href="/signup" className="font-semibold text-ink-soft underline underline-offset-4 hover:text-signal transition-colors">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
