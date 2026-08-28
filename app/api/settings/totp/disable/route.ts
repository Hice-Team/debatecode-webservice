import { NextResponse } from 'next/server';
import { requireApiSession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { requireSecondFactor, type SecondFactorProof } from '@/app/lib/two-factor';

// 인증 앱 해제.
//
// 해제에도 확인을 받는다. 세션만 있으면 2차 인증을 끌 수 있다면, 세션을 훔친 사람이
// 가장 먼저 하는 일이 그것이 된다 — 2차 인증이 막으려던 상황에서 2차 인증이 사라진다.
export async function POST(req: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  const { userId } = session;

  const body = await req.json().catch(() => ({}));
  const proof = (body?.proof ?? null) as SecondFactorProof | null;

  const verified = await requireSecondFactor(userId, proof);
  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error, required: verified.required ?? null },
      { status: proof ? 400 : 401 },
    );
  }

  // 인증 앱을 끄면 그 앱을 위해 만든 백업 코드도 함께 무효가 된다.
  // 남겨 두면 "2차 인증을 껐는데 아직 통하는 코드"가 떠돈다.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorTempSecret: null },
    }),
    prisma.backupCode.deleteMany({ where: { userId } }),
    // 통과 기록도 함께 지운다. 남겨 두면 다시 켰을 때 예전 기록이 되살아난다.
    prisma.twoFactorSession.deleteMany({ where: { userId } }),
  ]);

  return NextResponse.json({ ok: true });
}
