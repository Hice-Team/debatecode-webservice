'use server';

import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { encryptSecret } from '@/app/lib/crypto';

export async function POST() {
  const session = await verifySession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user?.email) return NextResponse.json({ error: 'no-email' }, { status: 400 });

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, 'debate.app', secret);

  await prisma.user.update({ where: { id: session.userId }, data: { twoFactorTempSecret: await encryptSecret(secret) } });

  return NextResponse.json({ otpauth });
}
