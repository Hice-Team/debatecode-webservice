import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/lib/supabase/server';

// 반쪽 계정 탈출구 — 로그인은 되어 있는데 앱 쪽 계정 정보가 없는 상태를 끊는다.
//
// 이런 상태가 생기는 경로가 실제로 있다. 가입 위저드는 마지막 단계에서야 User 행을 만들고
// (prisma/schema.prisma의 SignupDraft 참고), 소셜 로그인은 그 전에 이미 Supabase 인증
// 사용자를 만든다. 중간에 이탈하거나 마지막 저장이 실패하면 "인증은 됐는데 계정은 없는"
// 상태로 남는다.
//
// 이 상태에서 예전 동작은 무한 리다이렉트였다.
//   보호된 화면 → getUser()가 /login으로 → /login은 세션이 있으니 /dashboard로
//   → /dashboard가 다시 getUser()로 → …
// 브라우저는 결국 "리다이렉트가 너무 많습니다"로 끝났고, 이용자에게는 그저
// "설정 페이지에 못 들어간다"로 보였다.
//
// 고리를 끊는 유일한 방법은 세션을 실제로 없애는 것이다. 그래서 여기서 로그아웃시키고
// 로그인 화면으로 돌려보낸다 — 로그아웃 뒤에는 /login이 더 이상 되돌려 보내지 않는다.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut().catch(() => {
    // 이미 만료된 세션이면 그대로 진행한다 — 쿠키는 어차피 지워진다
  });
  return NextResponse.redirect(new URL('/login?recovered=1', request.url));
}
