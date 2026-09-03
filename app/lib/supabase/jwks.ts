// Supabase JWKS(공개키 셋) 프로세스 전역 캐시.
//
// getClaims()는 클라이언트 인스턴스별로 JWKS를 캐시하는데, @supabase/ssr은
// 요청마다 새 클라이언트를 만들어 매 요청 네트워크 조회가 발생한다.
// 여기서 한 번 받아 프로세스 수준으로 캐시하고 getClaims({ jwks })로 주입한다.
//
// 실패했을 때가 더 중요하다. JWKS를 못 받으면 getClaims는 **매 요청** 원격
// `/auth/v1/user`로 떨어지고, 네트워크가 잠깐 끊긴 상태면 그 호출이 내부 재시도까지
// 돌며 `AuthRetryableFetchError: fetch failed`를 쏟아낸다. 그래서 두 가지를 둔다.
//
//   ① 타임아웃 — 응답이 없으면 매달리지 않고 끊는다. 없으면 요청이 통째로 멎는다.
//   ② 실패 기억(negative cache) — 방금 실패했으면 잠깐은 다시 시도하지 않는다.
//      이것이 없으면 요청 하나마다 "JWKS 실패 + getUser 실패" 두 번을 왕복한다.
import type { SupabaseClient } from '@supabase/supabase-js';

type GetClaimsOptions = NonNullable<Parameters<SupabaseClient['auth']['getClaims']>[1]>;
export type Jwks = NonNullable<GetClaimsOptions['jwks']>;

/** 성공한 키를 얼마나 들고 쓸지. */
const JWKS_TTL_MS = 10 * 60 * 1000;
/** 실패한 뒤 다시 시도하기까지. 짧게 둬야 네트워크가 돌아왔을 때 금방 회복한다. */
const RETRY_AFTER_MS = 30 * 1000;
/** 이만큼 응답이 없으면 끊는다 — 로그인 확인 하나에 페이지 전체가 매달리면 안 된다. */
const TIMEOUT_MS = 3_000;

const globalCache = globalThis as unknown as {
  __supabaseJwks?: { jwks: Jwks; fetchedAt: number };
  /** 마지막으로 실패한 시각 — 이 뒤 RETRY_AFTER_MS 동안은 건너뛴다 */
  __supabaseJwksFailedAt?: number;
};

export async function getCachedJwks(): Promise<Jwks | undefined> {
  const cached = globalCache.__supabaseJwks;
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.jwks;

  // 방금 실패했다면 굳이 또 두드리지 않는다. 낡았어도 들고 있던 키가 있으면 그것을 쓴다
  // — 만료된 키로 검증하면 어차피 getClaims가 거절하므로 위험하지 않고, 그 사이
  // 네트워크가 돌아오면 다음 창에서 새로 받는다.
  const failedAt = globalCache.__supabaseJwksFailedAt;
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_MS) return cached?.jwks;

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
      { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) {
      globalCache.__supabaseJwksFailedAt = Date.now();
      return cached?.jwks;
    }
    const jwks = (await res.json()) as Jwks;
    // 레거시(HS256) 프로젝트는 keys가 비어 있음 — 캐시하지 않고 getClaims의
    // getUser 폴백에 맡긴다.
    if (!jwks.keys || jwks.keys.length === 0) return undefined;

    globalCache.__supabaseJwks = { jwks, fetchedAt: Date.now() };
    globalCache.__supabaseJwksFailedAt = undefined;
    return jwks;
  } catch {
    globalCache.__supabaseJwksFailedAt = Date.now();
    return cached?.jwks;
  }
}
