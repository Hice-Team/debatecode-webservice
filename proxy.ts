import { NextResponse, type NextRequest } from 'next/server';
import { PATHNAME_HEADER } from '@/app/lib/request-context';

// Next 16의 `proxy.ts` (구 middleware.ts) — 요청이 렌더에 닿기 전에 도는 얇은 계층.
//
// 여기서 하는 일은 하나뿐이다: **현재 경로를 헤더에 찍는 것.**
//
// 레이아웃은 pathname을 알 수 없다. 그런데 유지보수 모드는 "어떤 경로냐"에 따라 통과
// 여부가 갈린다(콘솔·인증·헬스체크는 점검 중에도 열려 있어야 한다). 그 판단을 서버
// 컴포넌트에서 하려면 경로가 필요해서, 여기서 헤더로 넘긴다.
//
// 인증은 일부러 건드리지 않는다. 이 계층은 Edge 런타임이라 Prisma를 쓸 수 없고,
// 세션 갱신은 이미 클라이언트의 SessionRefresher와 서버 액션이 맡고 있다(app/lib/dal.ts).
// 여기에 인증을 끌어들이면 Supabase 왕복이 모든 요청에 붙는다.

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // 정적 자산과 이미지 최적화 경로는 건너뛴다 — 헤더 하나 때문에 CSS/JS 요청까지
  // 이 계층을 태울 이유가 없다.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.png|logo.png|manifest.webmanifest|judge/).*)'],
};
