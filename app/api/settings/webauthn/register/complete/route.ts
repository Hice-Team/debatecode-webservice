'use server';

import crypto from 'crypto';
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

    // registrationInfo shape differs between library versions. Normalize buffers safely.
    const infoAny = registrationInfo as any;

    function toUint8Array(x: any): Uint8Array | null {
      if (!x) return null;
      // Node Buffer
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(x)) return new Uint8Array(x);
      // ArrayBuffer
      if (x instanceof ArrayBuffer) return new Uint8Array(x);
      // TypedArray / DataView
      if (ArrayBuffer.isView(x)) return new Uint8Array((x as any).buffer, (x as any).byteOffset || 0, (x as any).byteLength || undefined);
      // base64 string? try to decode
      if (typeof x === 'string') {
        try {
          return new Uint8Array(Buffer.from(x, 'base64'));
        } catch {
          return null;
        }
      }
      return null;
    }

    // candidate sources for raw id / public key
    const rawCandidates = [infoAny.credentialID, infoAny.credential?.rawId, infoAny.credential];
    const pubCandidates = [infoAny.credentialPublicKey, infoAny.credential?.publicKey];

    let rawArr: Uint8Array | null = null;
    for (const c of rawCandidates) {
      rawArr = toUint8Array(c);
      if (rawArr) break;
    }

    let pubArr: Uint8Array | null = null;
    for (const c of pubCandidates) {
      pubArr = toUint8Array(c);
      if (pubArr) break;
    }

    if (!rawArr || !pubArr) return NextResponse.json({ ok: false, error: 'no-raw' }, { status: 400 });

    const credID = Buffer.from(rawArr).toString('base64url');
    const credential = {
      credentialID: credID,
      publicKey: Buffer.from(pubArr).toString('base64url'),
      counter: infoAny.counter ?? infoAny.counter,
      fmt: infoAny.fmt ?? infoAny.fmt,
    };

    await prisma.webauthnKey.create({ data: { id: crypto.randomUUID(), userId: session.userId, name: body.name ?? null, credential: JSON.stringify(credential) } });
    await prisma.user.update({ where: { id: session.userId }, data: { webauthnChallenge: null } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
