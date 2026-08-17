'use server';

import { NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';

export async function POST(req: Request) {
  const session = await verifySession();
  const body = await req.json().catch(() => ({}));
  const attestationResponse = body; // forwarded from client

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { webauthnChallenge: true } });
  if (!user?.webauthnChallenge) return NextResponse.json({ ok: false, error: 'no-challenge' }, { status: 400 });

  try {
    const verification = await verifyRegistrationResponse({
      response: attestationResponse,
      expectedChallenge: user.webauthnChallenge,
      expectedOrigin: process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN || (process.env.NEXTAUTH_URL ?? 'http://localhost'),
      expectedRPID: process.env.NEXT_PUBLIC_WEBAUTHN_RPID || (new URL(process.env.NEXTAUTH_URL || 'http://localhost')).hostname,
    });

    if (!verification.verified) return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 });

    const { registrationInfo } = verification;
    if (!registrationInfo) return NextResponse.json({ ok: false, error: 'no-info' }, { status: 400 });

    const rawId = registrationInfo.credential.rawId as ArrayBuffer | undefined;
    const pubKey = registrationInfo.credentialPublicKey as ArrayBuffer | undefined;
    if (!rawId || !pubKey) return NextResponse.json({ ok: false, error: 'no-raw' }, { status: 400 });
    const credID = Buffer.from(new Uint8Array(rawId)).toString('base64url');
    const credential = {
      credentialID: credID,
      publicKey: Buffer.from(new Uint8Array(pubKey)).toString('base64url'),
      counter: registrationInfo.counter,
      fmt: registrationInfo.fmt,
    };

    await prisma.webauthnKey.create({ data: { userId: session.userId, name: body.name ?? null, credential: JSON.stringify(credential) } });
    await prisma.user.update({ where: { id: session.userId }, data: { webauthnChallenge: null } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
