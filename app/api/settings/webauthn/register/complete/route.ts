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

    // ── 라이브러리 버전 차이 흡수 ──
    // @simplewebauthn/server는 메이저 버전마다 registrationInfo의 모양을 바꿨다.
    //   v7 이하: { credentialID, credentialPublicKey }
    //   v9 이상: { credential: { id/rawId, publicKey } }
    // 게다가 값의 타입도 Buffer / ArrayBuffer / TypedArray / base64 문자열로 제각각이다.
    // 어느 쪽이 오든 Uint8Array로 맞춰 두고, 알아볼 수 없으면 null을 돌려 400으로 끝낸다.
    // (여기서 조용히 넘어가면 못 쓰는 키가 등록돼 로그인할 때 비로소 실패한다.)
    const info: Record<string, unknown> = registrationInfo;
    const nested = (info.credential ?? {}) as Record<string, unknown>;

    function toUint8Array(x: unknown): Uint8Array | null {
      if (!x) return null;
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(x)) return new Uint8Array(x);
      if (x instanceof ArrayBuffer) return new Uint8Array(x);
      if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
      if (typeof x === 'string') {
        try {
          return new Uint8Array(Buffer.from(x, 'base64'));
        } catch {
          return null;
        }
      }
      return null;
    }

    const rawCandidates: unknown[] = [info.credentialID, nested.rawId, nested.id, info.credential];
    const pubCandidates: unknown[] = [info.credentialPublicKey, nested.publicKey];

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
      counter: typeof info.counter === 'number' ? info.counter : 0,
      fmt: typeof info.fmt === 'string' ? info.fmt : null,
    };

    await prisma.webauthnKey.create({ data: { id: crypto.randomUUID(), userId: session.userId, name: body.name ?? null, credential: JSON.stringify(credential) } });
    await prisma.user.update({ where: { id: session.userId }, data: { webauthnChallenge: null } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 400 });
  }
}
