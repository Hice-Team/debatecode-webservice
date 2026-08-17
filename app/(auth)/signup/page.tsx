import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { prisma } from '@/app/lib/prisma';
import SignupWizard from './signup-wizard';

export const metadata: Metadata = { title: '회원가입' };

// 세션 상태에 따라 위저드 시작 단계를 결정한다.
// · 세션 없음 → 약관 동의부터
// · 세션 있음 + 동의 전(소셜로 먼저 로그인된 신규 유저) → 약관 동의부터
// · 세션 있음 + 동의 완료 + 프로필 미완 → 계정 정보부터 (소셜 콜백 복귀 지점)
// · 프로필 완료 → 대시보드로
export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { oauthError } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialStep: 'consent' | 'account' = 'consent';
  let requiresPassword = true;
  let initialNickname = '';

  if (user) {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, consentAt: true, profileCompleted: true },
    });
    if (dbUser?.profileCompleted) redirect('/dashboard');

    // 네이버는 커스텀 OAuth라 magiclink로 세션을 발급해 app_metadata.provider가 'email'로 찍힌다.
    // user_metadata.provider 마커로 소셜 가입을 판별해 비밀번호 요구를 건너뛴다.
    const isSocial = user.app_metadata.provider !== 'email' || user.user_metadata?.provider === 'naver';
    requiresPassword = !isSocial;
    initialNickname = dbUser?.name ?? (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '');
    initialStep = dbUser?.consentAt ? 'account' : 'consent';
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">JOIN THE DEBATE</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-ink-soft"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            당신의 코드를 변호하세요
          </h1>
        </div>

        <div className="bg-white rounded-xl border border-ink/10 shadow-sm p-8">
          <SignupWizard
            initialStep={initialStep}
            requiresPassword={requiresPassword}
            initialNickname={initialNickname}
            hasSession={!!user}
            oauthError={typeof oauthError === 'string' ? oauthError : undefined}
          />
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft/60">
          이미 계정이 있나요?{' '}
          <Link
            href="/login"
            className="font-semibold text-ink-soft underline underline-offset-4 hover:text-signal transition-colors"
          >
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
