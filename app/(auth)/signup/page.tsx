import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { prisma } from '@/app/lib/prisma';
import { loadDraft } from '@/app/lib/signup-draft';
import { decryptSecret } from '@/app/lib/crypto';
import SignupWizard from './signup-wizard';

export const metadata: Metadata = { title: '회원가입' };

// 위저드 시작 단계는 **진행 중인 초안**이 결정한다(app/lib/signup-draft.ts).
// 계정은 마지막 단계에서 만들어지므로, 그전까지의 진행 상태는 세션이 아니라 초안에만 있다.
//
// · 초안 없음 → 약관 동의부터
// · 초안 있음 → 초안이 기록한 단계부터, 입력값을 채워서
// · 같은 IP에 초안이 있으나 쿠키가 없음 → 동의부터 시작하되 "이어서 할 수 있다"고 알린다
// · 프로필까지 끝난 계정으로 들어옴 → 대시보드로
export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { oauthError } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { draft, resumableByEmail } = await loadDraft();

  let initialStep: 'consent' | 'account' | 'profile' = 'consent';
  // 세션이 있으면 소셜 가입이다 — 이메일·비밀번호는 소셜 계정이 정하므로 묻지 않는다.
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

    // 소셜 가입은 OAuth 콜백이 동의를 이미 기록한다 — 돌아온 사람에게 동의를 두 번 받지 않는다
    if (dbUser?.consentAt) initialStep = 'account';
  }

  if (draft?.step === 'account' || draft?.step === 'profile') {
    initialStep = draft.step;
  }

  // 초안의 개인정보는 암호화돼 있다 — 화면에 다시 채우려면 여기서 푼다
  const initialBirthdate = (await decryptSecret(draft?.birthdateEnc)) ?? '';
  const initialGender = (await decryptSecret(draft?.genderEnc)) ?? '';

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-block py-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-600">JOIN THE DEBATE</span>
          </Link>
          <h1
            className="mt-2 text-3xl font-bold tracking-tight text-ink-soft"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            당신의 코드를 변호하세요
          </h1>
        </div>

        <div className="bg-white rounded-xl border border-hairline shadow-sm p-8">
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
