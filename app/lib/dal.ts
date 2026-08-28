// Data Access Layer — Next.js 16 공식 인증 패턴.
// 보호가 필요한 서버 페이지/route handler는 verifySession()을 호출한다.
// 레이아웃에서는 인증 체크를 하지 않는다.
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { createClient } from './supabase/server';
import { getCachedJwks } from './supabase/jwks';

// 세션 검증 — 클라이언트의 SessionRefresher가 세션 쿠키를 갱신하므로 페이지에서는
// JWT 서명을 로컬(JWKS)로 검증한다. getUser()와 달리 Auth 서버 왕복이 없다.
const getVerifiedClaims = cache(async () => {
  const supabase = await createClient();
  const jwks = await getCachedJwks();
  const { data } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
  return data?.claims ?? null;
});

/**
 * 로그인 세션의 신원. Supabase 액세스 토큰의 `session_id`다.
 * 2차 인증 통과 기록이 이 값에 붙는다(app/lib/two-factor.ts).
 */
export const getSessionId = cache(async (): Promise<string> => {
  const claims = await getVerifiedClaims();
  return (claims?.session_id as string | undefined) ?? '';
});

/**
 * 이 세션이 2차 인증까지 마쳤는가.
 *
 * 2차 인증을 켜지 않은 계정에는 아무것도 요구하지 않는다 — 없는 수단을 요구하면
 * 그 계정은 아무 데도 못 들어간다.
 */
export const twoFactorStatus = cache(
  async (userId: string): Promise<{ required: boolean; satisfied: boolean }> => {
    const { getTwoFactorState, isSessionVerified } = await import('./two-factor');
    const state = await getTwoFactorState(userId);
    if (!state.any) return { required: false, satisfied: true };
    const sessionId = await getSessionId();
    return { required: true, satisfied: await isSessionVerified(sessionId, userId) };
  },
);

/**
 * 보호된 페이지의 입구.
 *
 * 두 가지를 본다 — 로그인했는가, 그리고 **2차 인증을 켠 계정이라면 이 세션이
 * 그것을 통과했는가.**
 *
 * 두 번째가 필요한 이유: Supabase는 비밀번호가 맞는 순간 세션을 발급한다. 그 앞을
 * 막을 수 없으므로, 통과하지 않은 세션이 아무것도 열지 못하게 하는 쪽으로 막는다.
 * 그래서 이 함수를 지나가는 모든 화면이 자동으로 보호된다 — 화면마다 따로 챙기면
 * 언젠가 하나를 빠뜨리고, 빠뜨린 그 화면이 구멍이 된다.
 */
export const verifySession = cache(async () => {
  const claims = await getVerifiedClaims();
  if (!claims) redirect('/login');

  const userId = claims.sub as string;
  const { required, satisfied } = await twoFactorStatus(userId);
  if (required && !satisfied) redirect('/login/verify');

  return { userId, email: claims.email! };
});

/**
 * 2차 인증 화면 자신이 쓰는 세션 조회.
 *
 * verifySession()을 쓸 수 없다 — 통과하지 못한 세션을 다시 그 화면으로 보내
 * 무한 고리가 된다. 여기서는 "로그인은 됐다"까지만 확인한다.
 */
export const getPendingSession = cache(async () => {
  const claims = await getVerifiedClaims();
  if (!claims?.sub) return null;
  return {
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? '',
    sessionId: (claims.session_id as string | undefined) ?? '',
  };
});

/**
 * 라우트 핸들러(API)용 세션 확인.
 *
 * verifySession()은 세션이 없으면 `/login`으로 **리다이렉트**한다. 페이지에서는 맞는
 * 동작이지만 API에서는 아니다 — fetch가 307을 따라가 로그인 페이지 HTML을 받고,
 * 화면에는 "JSON 파싱 실패"가 뜬다. 세션 만료가 "AI 응답 실패"처럼 보이는 것이다.
 *
 * 그래서 API는 이쪽을 쓴다. 없으면 null을 돌려주고, 호출부가 401 JSON을 만든다.
 */
export const getApiSession = cache(async () => {
  const claims = await getVerifiedClaims();
  if (!claims?.sub) return null;

  // 페이지와 같은 기준을 쓴다. 2차 인증을 통과하지 않은 세션은 API도 열지 않는다 —
  // 화면만 막고 API를 열어 두면 막은 것이 아니다.
  const userId = claims.sub as string;
  const { required, satisfied } = await twoFactorStatus(userId);
  if (required && !satisfied) return null;

  return { userId, email: (claims.email as string | undefined) ?? '' };
});

/** 401 응답까지 만들어 주는 짧은 형태 — `const s = await requireApiSession(); if ('response' in s) return s.response;` */
export async function requireApiSession(): Promise<
  { userId: string; email: string } | { response: Response }
> {
  const session = await getApiSession();
  if (session) return session;
  // 로그인은 됐는데 2차 인증만 남은 경우와, 아예 로그인하지 않은 경우를 구분해 준다 —
  // 화면이 "로그인하세요"와 "확인 코드를 넣으세요" 중 무엇을 띄울지 알아야 한다.
  const pending = await getPendingSession();
  if (pending) {
    return {
      response: Response.json(
        { error: '2차 인증 확인이 필요합니다.', code: 'two_factor_required' },
        { status: 403 },
      ),
    };
  }
  return {
    response: Response.json(
      { error: '로그인이 필요합니다.', code: 'unauthenticated' },
      { status: 401 },
    ),
  };
}

// nav 등 비보호 표면용 — 리다이렉트하지 않음
export const getSessionOptional = cache(async () => {
  const claims = await getVerifiedClaims();
  if (!claims) return null;
  return { userId: claims.sub, email: claims.email! };
});

// 프로필 정보 포함 (네비게이션용)
export const getSessionWithProfile = cache(async () => {
  const claims = await getVerifiedClaims();
  if (!claims) return null;
  
  const dbUser = await prisma.user.findUnique({
    where: { id: claims.sub },
    // role — 프로필 메뉴의 디베이트메이트 항목이 신청 페이지로 갈지 콘솔로 갈지 정한다
    select: { id: true, email: true, name: true, avatarUrl: true, role: true },
  });
  
  if (!dbUser) return null;
  return dbUser;
});

export const getUser = cache(async () => {
  const { userId } = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  // 인증은 됐는데 앱 쪽 계정이 없는 반쪽 상태 — /login으로 보내면 무한 고리가 된다
  // (/login은 세션이 있으면 /dashboard로 되돌려 보낸다). 복구 경로가 세션을 끊어 준다.
  if (!user) redirect('/auth/recover');
  return user;
});
