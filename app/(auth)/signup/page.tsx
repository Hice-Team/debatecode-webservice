import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { prisma } from '@/app/lib/prisma';
import { loadDraft } from '@/app/lib/signup-draft';
import { decryptSecret } from '@/app/lib/crypto';
import SignupWizard from './signup-wizard';

import I18nSlot from '@/app/components/i18n-slot';
import LanguageSwitcher from '@/app/components/language-switcher';
import ThemeToggle from '@/app/components/theme-toggle';

export const metadata: Metadata = { title: '회원가입' };

export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { oauthError } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { draft, resumableByEmail } = await loadDraft();

  let initialStep: 'consent' | 'account' | 'profile' = 'consent';
  const requiresPassword = !user;
  let initialEmail = draft?.email ?? '';
  let initialNickname = draft?.nickname ?? '';

  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, consentAt: true, profileCompleted: true },
    });
    if (dbUser?.profileCompleted) redirect('/dashboard');

    initialEmail = user.email ?? initialEmail;
    initialNickname =
      initialNickname || dbUser?.name || (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '');

    if (dbUser?.consentAt) initialStep = 'account';
  }

  if (draft?.step === 'account' || draft?.step === 'profile') {
    initialStep = draft.step;
  }

  const initialBirthdate = (await decryptSecret(draft?.birthdateEnc)) ?? '';
  const initialGender = (await decryptSecret(draft?.genderEnc)) ?? '';

  return (
    <div className="relative min-h-screen flex flex-col justify-between px-4 py-6 overflow-hidden bg-paper">
      {/* Mesh Background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 100% at 50% -20%, rgba(91,76,240,0.15) 0%, rgba(245,246,251,1) 60%)',
        }}
      />

      {/* Top Bar — Brand & Controls */}
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

      <main className="w-full max-w-lg mx-auto my-auto relative z-10">
        <div className="mb-6 text-center">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-brand-600 mb-2">
            JOIN THE DEBATE
          </span>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-fg [word-break:keep-all]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            <I18nSlot k="signup-title" fallback="당신의 코드를 변호하세요" />
          </h1>
        </div>

        <div className="bg-surface/90 backdrop-blur-xl rounded-[var(--radius-panel)] border border-brand-100 shadow-[0_24px_60px_-24px_rgba(24,0,172,0.15)] p-6 sm:p-8">
          <SignupWizard
            initialStep={initialStep}
            requiresPassword={requiresPassword}
            initialEmail={initialEmail}
            initialNickname={initialNickname}
            initialBirthdate={initialBirthdate}
            initialGender={initialGender}
            resumableByEmail={resumableByEmail}
            oauthError={typeof oauthError === 'string' ? oauthError : undefined}
          />
        </div>

        <p className="mt-6 text-center text-sm text-fg-secondary">
          <I18nSlot k="have-account" fallback="이미 계정이 있나요?" />{' '}
          <Link
            href="/login"
            className="font-semibold text-fg underline underline-offset-4 hover:text-signal transition-colors"
          >
            <I18nSlot k="login" fallback="로그인" />
          </Link>
        </p>
      </main>

      <footer className="w-full text-center py-4 text-xs text-fg-quiet">
        © {new Date().getFullYear()} Debate Code. All rights reserved.
      </footer>
    </div>
  );
}
