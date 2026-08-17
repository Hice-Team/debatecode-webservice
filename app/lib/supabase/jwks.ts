// Supabase JWKS(공개키 셋) 프로세스 전역 캐시.
// getClaims()는 클라이언트 인스턴스별로 JWKS를 캐시하는데, @supabase/ssr은
// 요청마다 새 클라이언트를 만들어 매 요청 네트워크 조회가 발생한다.
// 여기서 한 번 받아 프로세스 수준으로 캐시하고 getClaims({ jwks })로 주입한다.
import type { SupabaseClient } from '@supabase/supabase-js';

type GetClaimsOptions = NonNullable<Parameters<SupabaseClient['auth']['getClaims']>[1]>;
export type Jwks = NonNullable<GetClaimsOptions['jwks']>;

const JWKS_TTL_MS = 10 * 60 * 1000;

const globalCache = globalThis as unknown as {
  __supabaseJwks?: { jwks: Jwks; fetchedAt: number };
};

export async function getCachedJwks(): Promise<Jwks | undefined> {
  const cached = globalCache.__supabaseJwks;
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.jwks;

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      { cache: 'no-store' },
    );
    if (!res.ok) return cached?.jwks;
    const jwks = (await res.json()) as Jwks;
    // 레거시(HS256) 프로젝트는 keys가 비어 있음 — 캐시하지 않고 getClaims의
    // getUser 폴백에 맡긴다.
    if (!jwks.keys || jwks.keys.length === 0) return undefined;
    globalCache.__supabaseJwks = { jwks, fetchedAt: Date.now() };
    return jwks;
  } catch {
    return cached?.jwks;
  }
}
