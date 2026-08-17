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

export const verifySession = cache(async () => {
  const claims = await getVerifiedClaims();
  if (!claims) redirect('/login');
  return { userId: claims.sub, email: claims.email! };
});

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
  if (!user) redirect('/login');
  return user;
});
