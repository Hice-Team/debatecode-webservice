import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';
import { createAdminClient } from '@/app/lib/supabase/admin';
import { prisma } from '@/app/lib/prisma';
import { addMarketingConsent } from '@/app/lib/marketing';
import { recordLoginEvent } from '@/app/lib/security';
import { SIGNUP_CONSENT_COOKIE } from '@/app/(auth)/signup/options';
import { NAVER_STATE_COOKIE } from '../start/route';

function publicOrigin(request: Request): string {
  const h = request.headers;
  const proto = h.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return `${proto}://${host}`;
}

// 네이버 OAuth2 콜백 — code를 토큰으로 교환하고 프로필(이메일)로 Supabase 세션을 발급한다.
// 커스텀 프로바이더라서 admin.generateLink(magiclink) + verifyOtp로 세션 쿠키를 심는다.
export async function GET(request: NextRequest) {
  const origin = publicOrigin(request);
  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/login?oauthError=${encodeURIComponent(msg)}`, origin));

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = request.cookies.get(NAVER_STATE_COOKIE)?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return fail('네이버 로그인 검증에 실패했습니다. 다시 시도해 주세요.');
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('네이버 로그인이 설정되지 않았습니다.');

  try {
    // 1) 토큰 교환
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('state', state);
    const tokenRes = await fetch(tokenUrl, { signal: AbortSignal.timeout(15000) });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) return fail('네이버 토큰 교환에 실패했습니다.');

    // 2) 프로필 조회
    const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      signal: AbortSignal.timeout(15000),
    });
    const meJson = (await meRes.json()) as {
      response?: { id?: string; email?: string; name?: string; nickname?: string };
    };
    const profile = meJson.response;
    const email = profile?.email?.toLowerCase();
    if (!email) return fail('네이버 계정의 이메일 제공에 동의해야 로그인할 수 있습니다.');
    const name = profile?.name || profile?.nickname || email.split('@')[0];

    // 3) Supabase 사용자 확보 (없으면 생성, 트리거가 public.User 생성)
    const admin = createAdminClient();
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name, provider: 'naver', naver_id: profile?.id },
    });
    if (created.error && !/registered|already/i.test(created.error.message)) {
      return fail('네이버 계정으로 사용자를 생성하지 못했습니다.');
    }

    // 4) 매직링크 발급 → verifyOtp로 세션 쿠키 설정
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (link.error || !tokenHash) return fail('네이버 로그인 세션 발급에 실패했습니다.');

    const supabase = await createClient();
    const { data: verified, error: verifyErr } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });
    if (verifyErr || !verified.user) return fail('네이버 로그인 세션 확인에 실패했습니다.');

    // 5) 동의 쿠키 기록(가입 위저드 경유 시) + 라우팅 (기존 /auth/callback과 동일)
    const dbUser = await prisma.user.findUnique({
      where: { id: verified.user.id },
      select: { aiOnboarded: true, consentAt: true, profileCompleted: true },
    });
    const consent = request.cookies.get(SIGNUP_CONSENT_COOKIE)?.value;
    if (dbUser && !dbUser.consentAt && consent) {
      await prisma.user
        .updateMany({
          where: { id: verified.user.id, consentAt: null },
          data: { consentAt: new Date(), ...(consent === 'marketing' ? { marketingConsentAt: new Date() } : {}) },
        })
        .catch(() => {});
      // 동의했으면 발송 명단에도 올린다 — 콘솔의 홍보 메일은 이 명단만 본다
      if (consent === 'marketing' && verified.user.email) {
        await addMarketingConsent({ email: verified.user.email, userId: verified.user.id, source: 'signup' });
      }
    }

    await recordLoginEvent(verified.user.id, request.headers).catch(() => {});

    const next =
      dbUser && !dbUser.profileCompleted ? '/signup' : dbUser && !dbUser.aiOnboarded ? '/onboarding/ai' : '/dashboard';
    const response = NextResponse.redirect(new URL(next, origin));
    response.cookies.delete(SIGNUP_CONSENT_COOKIE);
    response.cookies.delete(NAVER_STATE_COOKIE);
    return response;
  } catch {
    return fail('네이버 로그인 처리 중 오류가 발생했습니다.');
  }
}
