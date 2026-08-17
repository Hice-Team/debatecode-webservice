import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { prisma } from '@/app/lib/prisma';
import { addMarketingConsent } from '@/app/lib/marketing';
import { recordLoginEvent } from '@/app/lib/security';
import { SIGNUP_CONSENT_COOKIE } from '@/app/(auth)/signup/options';

// 소셜 로그인(OAuth) 콜백 — code를 세션으로 교환한다.
// 이메일 링크 콜백(app/auth/confirm/route.ts)과 달리 OTP가 아닌 authorization code exchange를 사용한다.
// 가입 위저드에서 출발한 경우 동의 쿠키(SIGNUP_CONSENT_COOKIE)를 읽어 동의 시각을 기록하고,
// 프로필 미완성 유저는 /signup으로 보내 계정 정보 단계부터 이어가게 한다.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const user = await prisma.user.findUnique({
        where: { id: data.user.id },
        select: { aiOnboarded: true, consentAt: true, profileCompleted: true },
      });

      // 가입 위저드 1단계에서 심은 동의 쿠키가 있으면 최초 1회 기록
      const consent = request.cookies.get(SIGNUP_CONSENT_COOKIE)?.value;
      if (user && !user.consentAt && consent) {
        await prisma.user
          .updateMany({
            where: { id: data.user.id, consentAt: null },
            data: { consentAt: new Date(), ...(consent === 'marketing' ? { marketingConsentAt: new Date() } : {}) },
          })
          .catch(() => {});
        // 동의했으면 발송 명단에도 올린다 — 콘솔의 홍보 메일은 이 명단만 본다
        if (consent === 'marketing' && data.user.email) {
          await addMarketingConsent({ email: data.user.email, userId: data.user.id, source: 'signup' });
        }
      }

      // IP 보안 — OAuth/SSO 로그인도 위치/기기 기록 (실패해도 로그인은 진행)
      await recordLoginEvent(data.user.id, request.headers).catch(() => {});

      const next =
        user && !user.profileCompleted ? '/signup' : user && !user.aiOnboarded ? '/onboarding/ai' : '/dashboard';
      const response = NextResponse.redirect(new URL(next, request.url));
      response.cookies.delete(SIGNUP_CONSENT_COOKIE);
      return response;
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth', request.url));
}
