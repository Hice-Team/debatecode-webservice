import { createClient } from '@supabase/supabase-js';

// 서비스 롤 관리자 클라이언트 — 서버 전용. 세션을 유지하지 않는다.
// 커스텀 OAuth(네이버 등)에서 사용자 생성 및 매직링크 발급(generateLink)에 사용한다.
// SUPABASE_SERVICE_ROLE_KEY는 절대 클라이언트로 노출하지 않는다.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
