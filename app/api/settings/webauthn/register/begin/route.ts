import { NextResponse } from 'next/server';
import { requireApiSession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { beginKeyRegistration } from '@/app/lib/two-factor';

// 보안키 등록 시작 — 챌린지를 만들어 내려보낸다.
// 중복 등록 방지(excludeCredentials)와 챌린지 만료는 app/lib/two-factor.ts에 있다.
export async function POST() {
  const session = await requireApiSession();
  if ('response' in session) return session.response;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true },
  });
  if (!user) return NextResponse.json({ error: '계정 정보를 찾지 못했습니다.' }, { status: 400 });

  const options = await beginKeyRegistration({ id: user.id, email: user.email });
  return NextResponse.json(options, { headers: { 'Cache-Control': 'no-store' } });
}
