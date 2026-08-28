import { NextResponse } from 'next/server';
import { requireApiSession } from '@/app/lib/dal';
import { beginKeyAssertion } from '@/app/lib/two-factor';

// 보안키로 본인 확인 시작.
//
// 지금까지는 보안키를 **등록**만 할 수 있고 그 키로 무언가를 확인할 방법이 없었다.
// 등록만 되는 인증 수단은 인증 수단이 아니다. 이 라우트가 챌린지를 발급하고,
// 실제 검증은 그 확인을 요구하는 쪽(예: 회원 탈퇴)이 한다.
export async function POST() {
  const session = await requireApiSession();
  if ('response' in session) return session.response;

  const options = await beginKeyAssertion(session.userId);
  if (!options) {
    return NextResponse.json({ error: '등록된 보안키가 없습니다.' }, { status: 409 });
  }
  return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } });
}
