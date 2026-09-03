import { NextResponse } from 'next/server';
import { requireApiSession } from '@/app/lib/dal';
import { createClient } from '@/app/lib/supabase/server';
import { AI_ATTACHMENT_BUCKET } from '@/app/lib/storage';

// AI Search 첨부 열람 — 비공개 버킷의 파일을 잠깐 열리는 서명 URL로 넘겨준다.
//
// 왜 프록시를 두는가. 서명 URL은 몇 분이면 만료되므로 메시지에 담아 저장할 수 없다.
// 그래서 DB에는 만료되지 않는 이 주소를 담고, 실제로 열 때마다 세션을 확인해 새 서명 URL을
// 발급한다. 화면(<img>·<video>·fetch)은 같은 출처라 쿠키가 함께 가므로 그대로 동작한다.
//
// 권한은 두 겹이다.
//   1) 여기서 키 앞자리(userId)를 세션과 대조한다 — 남의 첨부 주소를 알아내도 열리지 않는다.
//   2) 버킷 RLS가 같은 조건을 한 번 더 본다 — 이 라우트에 구멍이 나도 스토리지가 막는다.
const SIGNED_TTL_SECONDS = 300;

export async function GET(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  const { userId } = session;

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 });

  // 상위 경로 탈출과 남의 폴더 접근을 여기서 끊는다
  if (path.includes('..') || !path.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(AI_ATTACHMENT_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  // 서명 URL로 넘긴다. 이 응답 자체는 절대 캐시되면 안 된다 —
  // 캐시되면 세션이 끝난 뒤에도 같은 링크가 살아 있는 셈이 된다.
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
