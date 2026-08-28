import { NextResponse } from 'next/server';
import { getPendingSession } from '@/app/lib/dal';
import { beginKeyAssertion } from '@/app/lib/two-factor';

// 로그인 2차 인증에서 쓰는 보안키 챌린지.
//
// 설정 화면의 /api/settings/webauthn/assert와 하는 일은 같지만 입구가 다르다.
// 그쪽은 requireApiSession()을 쓰는데, 그 함수는 **2차 인증을 통과하지 않은 세션을
// 막는다** — 즉 지금 통과하려는 사람은 그 라우트를 쓸 수 없다.
// 여기서는 "로그인은 됐다"까지만 확인한다.
export async function POST() {
  const pending = await getPendingSession();
  if (!pending) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const options = await beginKeyAssertion(pending.userId);
  if (!options) return NextResponse.json({ error: '등록된 보안키가 없습니다.' }, { status: 409 });

  return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } });
}
