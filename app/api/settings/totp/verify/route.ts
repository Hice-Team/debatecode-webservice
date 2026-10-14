import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import { requireApiSession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { decryptSecret, encryptSecret } from '@/app/lib/crypto';
import { durableRateLimit, retryAfterLabel } from '@/app/lib/rate-limit-durable';
import { issueBackupCodes, revokeVerifiedSessions } from '@/app/lib/two-factor';

// 인증 앱 등록 확정 — 앱에 뜬 코드를 한 번 맞혀야 켜진다.
//
// 여기에 시도 제한이 없었다. 6자리 숫자를 무제한으로 넣어 볼 수 있으면 등록 확인이
// 확인의 역할을 하지 못한다. 계정당 15분 5회로 묶는다(인스턴스가 바뀌어도 세는 카운터).
export async function POST(req: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  const { userId } = session;

  const gate = await durableRateLimit(`2fa:enroll:${userId}`, 5, 15 * 60 * 1000);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: `확인 시도가 너무 많습니다. ${retryAfterLabel(gate.retryAfterMs)} 뒤에 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: '6자리 숫자를 입력해 주세요.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorTempSecret: true },
  });
  if (!user?.twoFactorTempSecret) {
    return NextResponse.json({ error: '등록을 처음부터 다시 시작해 주세요.' }, { status: 400 });
  }

  const secret = await decryptSecret(user.twoFactorTempSecret);
  if (!secret) return NextResponse.json({ error: '등록 정보를 읽지 못했습니다.' }, { status: 400 });

  if (!authenticator.check(code, secret)) {
    return NextResponse.json(
      { error: '코드가 맞지 않습니다. 앱에 표시된 최신 코드를 입력해 주세요.' },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorSecret: await encryptSecret(secret),
      twoFactorTempSecret: null,
      twoFactorEnabled: true,
    },
  });

  // 등록과 동시에 백업 코드를 준다.
  //
  // 나중에 따로 발급하게 두면 대부분 발급하지 않는다. 그러면 휴대폰을 잃어버렸을 때
  // 계정을 되찾을 방법이 사라진다 — 2차 인증이 본인을 막는 상황이 가장 흔한 실패다.
  const backupCodes = await issueBackupCodes(userId);

  // 2차 인증을 **켠** 순간, 지금 열려 있는 세션들은 그것을 통과한 적이 없다.
  // 기록을 비워 다음 요청부터 모든 기기가 확인을 받게 한다 — 켜자마자 예전 세션이
  // 그대로 열려 있으면 켠 의미가 절반이 된다.
  await revokeVerifiedSessions(userId);

  return NextResponse.json({ ok: true, backupCodes }, { headers: { 'Cache-Control': 'no-store' } });
}
