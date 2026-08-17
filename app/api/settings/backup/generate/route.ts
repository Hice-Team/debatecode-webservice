'use server';

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { encryptSecret } from '@/app/lib/crypto';

function makeCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function POST() {
  const session = await verifySession();
  // generate 10 backup codes
  const codes: string[] = Array.from({ length: 10 }).map(() => makeCode());

  // store encrypted versions and mark unused
  await prisma.$transaction(async (tx) => {
    // remove previous codes
    await tx.backupCode.deleteMany({ where: { userId: session.userId } });
    for (const c of codes) {
      const encrypted = await encryptSecret(c);
      if (!encrypted) throw new Error('backup code encryption failed');
      await tx.backupCode.create({ data: { id: crypto.randomUUID(), userId: session.userId, code: encrypted } });
    }
  });

  return NextResponse.json({ ok: true, codes });
}
