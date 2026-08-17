import { NextResponse } from 'next/server';

// 네이버 로그인 시작 — 네이버는 Supabase 내장 프로바이더가 아니라서 커스텀 OAuth2로 처리한다.
// https://developers.naver.com/products/login/api/api.md
// 동의 쿠키(SIGNUP_CONSENT_COOKIE)는 signupWithOAuth에서 이미 설정되므로 여기서는 state만 심는다.
export const NAVER_STATE_COOKIE = 'naver_oauth_state';

function publicOrigin(request: Request): string {
  const h = request.headers;
  const proto = h.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const host = h.get('x-forwarded-host') ?? h.get('host');
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const origin = publicOrigin(request);
  if (!clientId) {
    return NextResponse.redirect(
      new URL(`/login?oauthError=${encodeURIComponent('네이버 로그인이 아직 설정되지 않았습니다. (NAVER_CLIENT_ID 필요)')}`, origin),
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = `${origin}/api/auth/naver/callback`;
  const authorize = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', redirectUri);
  authorize.searchParams.set('state', state);

  const res = NextResponse.redirect(authorize.toString());
  res.cookies.set(NAVER_STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
  return res;
}
