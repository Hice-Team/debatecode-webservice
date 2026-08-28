import { NextResponse } from 'next/server';
import { requireApiSession } from '@/app/lib/dal';
import { durableRateLimit, retryAfterLabel } from '@/app/lib/rate-limit-durable';
import { issueBackupCodes, revokeVerifiedSessions } from '@/app/lib/two-factor';

// 백업 코드 재발급.
//
// 저장 방식이 바뀌었다. 예전에는 AES-GCM 암호문으로 저장했는데, 암호화는 복호화가
// 되므로 키가 새면 코드도 함께 샌다 — 2차 인증을 우회하는 값을 되돌릴 수 있는 형태로
// 보관한다는 뜻이다. 이제 sha256 해시만 남는다(app/lib/two-factor.ts).
// 코드 자체도 8자리 hex(32비트)에서 8자리 Base32(40비트)로 올렸고, 옮겨 적을 때
// 헷갈리는 글자(0/O, 1/I)는 뺐다.
//
// 평문은 이 응답에만 존재한다. 다시 볼 수 없으므로 화면이 반드시 저장을 권해야 한다.
export async function POST() {
  const session = await requireApiSession();
  if ('response' in session) return session.response;

  // 재발급은 잦을 일이 아니다 — 반복 호출로 원장이 부풀지 않게 묶는다
  const gate = await durableRateLimit(`backup-codes:${session.userId}`, 5, 60 * 60 * 1000);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `재발급이 너무 잦습니다. ${retryAfterLabel(gate.retryAfterMs)} 뒤에 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  const codes = await issueBackupCodes(session.userId);
  // 수단이 바뀌었으니 통과 기록을 비운다 — 예전 코드로 통과한 세션이 그대로 열려 있으면
  // 재발급의 뜻("예전 것을 못 쓰게 한다")이 지켜지지 않는다.
  await revokeVerifiedSessions(session.userId);

  return NextResponse.json(
    { ok: true, codes },
    // 이 응답은 어디에도 남으면 안 된다
    { headers: { 'Cache-Control': 'no-store, private' } },
  );
}
