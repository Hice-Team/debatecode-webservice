'use server';

import { NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';

export async function POST() {
  const session = await verifySession();
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: 'no-user' }, { status: 400 });

  const existing = await prisma.webauthnKey.findMany({ where: { userId: session.userId } });

  const opts = await generateRegistrationOptions({
    rpName: 'debate.app',
    rpID: process.env.NEXT_PUBLIC_WEBAUTHN_RPID || (new URL(process.env.NEXTAUTH_URL || 'http://localhost')).hostname,
    userID: Buffer.from(user.id, 'utf8'),
    userName: user.email || user.id,
    timeout: 60000,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.id, type: 'public-key' })),
    authenticatorSelection: { userVerification: 'preferred' },
  });

  // store challenge
  await prisma.user.update({ where: { id: session.userId }, data: { webauthnChallenge: opts.challenge } });

  return NextResponse.json(opts);
}
