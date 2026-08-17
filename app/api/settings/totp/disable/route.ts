'use server';

import { NextResponse } from 'next/server';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';

export async function POST() {
  const session = await verifySession();
  await prisma.user.update({ where: { id: session.userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } });
  return NextResponse.json({ ok: true });
}
