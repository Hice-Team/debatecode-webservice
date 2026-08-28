import { NextResponse } from 'next/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { requireApiSession } from '@/app/lib/dal';
import { completeKeyRegistration, revokeVerifiedSessions } from '@/app/lib/two-factor';

// 보안키 등록 확정.
//
// 예전에는 이 파일이 @simplewebauthn의 버전별 응답 형태를 직접 흡수하고 있었다
// (credentialID / credential.rawId / base64 문자열 …). 라이브러리를 13으로 고정하고
// 그 처리를 app/lib/two-factor.ts 한 곳으로 옮겼다 — 등록과 인증이 같은 형태를
// 읽어야 하는데, 두 곳에서 각자 해석하면 언젠가 어긋난다.
export async function POST(req: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;

  const body = await req.json().catch(() => null);
  if (!body?.response?.id) {
    return NextResponse.json({ error: '보안키 응답을 확인하지 못했습니다.' }, { status: 400 });
  }

  const result = await completeKeyRegistration(
    session.userId,
    body.response as RegistrationResponseJSON,
    typeof body.name === 'string' ? body.name : null,
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // 첫 보안키를 등록하면 그 순간부터 2차 인증이 켜진 계정이 된다.
  // 지금 열려 있는 세션들은 그것을 통과한 적이 없으므로 기록을 비운다.
  await revokeVerifiedSessions(session.userId);

  return NextResponse.json({ ok: true, keyId: result.keyId });
}
