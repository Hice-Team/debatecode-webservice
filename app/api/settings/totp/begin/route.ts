'use server';

import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { encryptSecret } from '@/app/lib/crypto';

export async function POST() {
  const session = await verifySession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user?.email) return NextResponse.json({ error: 'no-email' }, { status: 400 });

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, 'debateCode', secret);

  // QR은 여기서 만들어 data: URL로 내려보낸다.
  //
  // 예전에는 화면에서 api.qrserver.com에 otpauth URL을 붙여 <img src>로 불렀다.
  // 그 URL에는 **TOTP 비밀키가 그대로 들어 있다** — 즉 2단계 인증의 씨앗을 매번
  // 외부 서비스에 넘기고 있었던 셈이고, 그쪽 로그에 남으면 2단계 인증의 의미가 없어진다.
  // 그 서비스가 죽으면 QR이 안 보이는 문제도 함께 사라진다.
  const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 200, margin: 1 });

  await prisma.user.update({ where: { id: session.userId }, data: { twoFactorTempSecret: await encryptSecret(secret) } });

  // secret은 앱에 QR을 못 찍는 이용자가 손으로 입력할 수 있게 함께 준다(otpauth 안에도 있다).
  return NextResponse.json({ otpauth, qrDataUrl, secret });
}
