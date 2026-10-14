import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import LoginForm from './login-form';
import { getSessionOptional } from '@/app/lib/dal';
import I18nSlot from '@/app/components/i18n-slot';
import LanguageSwitcher from '@/app/components/language-switcher';
import ThemeToggle from '@/app/components/theme-toggle';

export const metadata: Metadata = { title: '로그인' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  if (await getSessionOptional()) redirect('/dashboard');

  const { oauthError, reset } = await searchParams;
  return (
    <div className="relative min-h-screen flex flex-col justify-between px-4 py-6 overflow-hidden bg-paper">
      {/* Mesh background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 100% at 50% -20%, rgba(91,76,240,0.15) 0%, rgba(245,246,251,1) 60%)',
        }}
      />

      {/* Top Utility Bar — Brand Logo & Language/Theme controls */}
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pb-6">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-display font-bold text-lg text-fg tracking-tight group-hover:text-signal transition-colors">
            Debate Code
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Login Card */}
      <main className="w-full max-w-md mx-auto my-auto relative z-10">
        <div className="mb-6 text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-brand-600 mb-2">
            <I18nSlot k="welcome-back" fallback="WELCOME BACK" />
          </span>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-fg [word-break:keep-all]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            <I18nSlot k="login-title" fallback="다시 논증할 시간입니다" />
          </h1>
        </div>

        <div className="bg-surface/90 backdrop-blur-xl rounded-[var(--radius-panel)] border border-brand-100 shadow-[0_24px_60px_-24px_rgba(24,0,172,0.15)] p-6 sm:p-8">
          {reset === '1' && (
            <p
              role="status"
              className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
            >
              <I18nSlot k="reset-success-alert" fallback="비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요." />
              <span className="mt-1 block text-xs text-emerald-700/80">
                <I18nSlot k="reset-success-sub" fallback="안전을 위해 기존에 로그인돼 있던 기기는 모두 로그아웃되었습니다." />
              </span>
            </p>
          )}
          <LoginForm oauthError={typeof oauthError === 'string' ? oauthError : undefined} />
        </div>

        <p className="mt-6 text-center text-sm text-fg-secondary">
          <I18nSlot k="no-account" fallback="아직 계정이 없나요?" />{' '}
          <Link href="/signup" className="font-semibold text-fg underline underline-offset-4 hover:text-signal transition-colors">
            <I18nSlot k="sign-up-link" fallback="회원가입" />
          </Link>
        </p>
      </main>

      {/* Bottom Footer note */}
      <footer className="w-full text-center py-4 text-xs text-fg-quiet">
        © {new Date().getFullYear()} Debate Code. All rights reserved.
      </footer>
    </div>
  );
}
