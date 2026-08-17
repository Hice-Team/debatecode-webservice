import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { rateLimit } from '@/app/lib/rate-limit';

// 출시 알림 신청 — 대기 페이지(debate-commingsoon)에서 이메일만 받는다.
//
// 대기 페이지는 이 앱과 다른 곳에 올라갈 수 있는 정적 HTML이라 교차 출처 요청이 된다.
// 쿠키를 쓰지 않는 공개 접수 창구이므로 Origin은 열어 두되, 받는 것은 이메일 한 줄뿐이다.
// (쿠키가 오가지 않으니 CSRF로 쓸 여지가 없다. 대신 IP 단위 속도 제한을 건다.)

const schema = z.object({
  email: z.string().trim().toLowerCase().email('이메일 주소를 다시 확인해 주세요.').max(200),
  source: z.string().trim().max(40).optional(),
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
  if (!rateLimit(`launch-notify:${ip}`, 5, 60_000)) {
    return NextResponse.json(
      { error: '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429, headers: CORS },
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const first = Object.values(z.flattenError(parsed.error).fieldErrors).flat()[0];
    return NextResponse.json({ error: first ?? '이메일 주소를 확인해 주세요.' }, { status: 400, headers: CORS });
  }

  const { email, source } = parsed.data;

  try {
    // 같은 주소가 다시 와도 오류로 만들지 않는다 — 이용자에겐 "이미 신청됨"과 구분할 이유가 없다
    await prisma.launchNotify.upsert({
      where: { email },
      create: { email, source: source ?? 'coming-soon' },
      update: {},
    });
  } catch {
    return NextResponse.json({ error: '신청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500, headers: CORS });
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
