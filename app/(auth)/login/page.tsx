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
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden bg-paper">
      {/* Premium Background Mesh / Radial Gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 100% at 50% -20%, rgba(91,76,240,0.15) 0%, rgba(245,246,251,1) 60%)',
        }}
      />
      
      <div className="w-full max-w-md relative z-10">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">WELCOME BACK</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-fg"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            다시 논증할 시간입니다
          </h1>
        </div>

        <div className="bg-surface/90 backdrop-blur-xl rounded-[var(--radius-panel)] border border-brand-100 shadow-[0_24px_60px_-24px_rgba(24,0,172,0.15)] p-8">
          <LoginForm oauthError={typeof oauthError === 'string' ? oauthError : undefined} />
        </div>

        <p className="mt-6 text-center text-sm text-fg-secondary">
          아직 계정이 없나요?{' '}
          <Link href="/signup" className="font-semibold text-fg underline underline-offset-4 hover:text-signal transition-colors">
            회원가입
          </Link>
        </p>
      </div>
    </div>
  );
}
