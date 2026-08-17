'use server';

import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { decryptSecret, encryptSecret } from '@/app/lib/crypto';

export async function POST(req: Request) {
  const session = await verifySession();
  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? '').trim();
  if (!code) return NextResponse.json({ ok: false, error: 'no-code' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { twoFactorTempSecret: true } });
  if (!user?.twoFactorTempSecret) return NextResponse.json({ ok: false, error: 'no-temp' }, { status: 400 });

  const secret = await decryptSecret(user.twoFactorTempSecret);
  if (!secret) return NextResponse.json({ ok: false, error: 'no-secret' }, { status: 400 });
  const valid = authenticator.check(code, secret);
  if (!valid) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });

  // move temp secret to active secret
  await prisma.user.update({ where: { id: session.userId }, data: { twoFactorSecret: await encryptSecret(secret), twoFactorTempSecret: null, twoFactorEnabled: true } });
  return NextResponse.json({ ok: true });
}
