import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getCachedJwks } from './jwks';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // 세션 확인 — 내부의 getSession()이 만료된 토큰을 갱신하고 쿠키를 채운다.
  // 서명 검증은 캐시된 JWKS로 로컬 수행 (getUser()의 매 요청 Auth 서버 왕복 제거).
  const jwks = await getCachedJwks();
  const { data } = await supabase.auth.getClaims(undefined, jwks ? { jwks } : undefined);
  const user = data?.claims ? { id: data.claims.sub } : null;

  return { response, user };
}
