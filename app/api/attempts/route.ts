import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/app/lib/prisma';
import { createClient } from '@/app/lib/supabase/server';
import { rateLimit } from '@/app/lib/rate-limit';

// 실행/제출 시도 기록 — 워크스페이스 시도횟수 탭의 테이블 데이터.
// POST: 실행 1회를 기록, GET ?problemId=: 해당 문제의 내 기록 최근 50건.
const createSchema = z.object({
  problemId: z.number().int().positive(),
  code: z.string().min(1).max(50_000),
  language: z.enum(['javascript', 'python']),
  status: z.enum(['PASS', 'FAIL', 'ERROR', 'TIMEOUT']),
  passedCount: z.number().int().min(0),
  totalCount: z.number().int().min(1),
  kind: z.enum(['run', 'submit']).default('run'),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (!rateLimit(`attempt:${user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: '기록이 너무 잦습니다.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const attempt = await prisma.runAttempt.create({
    data: { userId: user.id, ...parsed.data },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({ id: attempt.id, createdAt: attempt.createdAt });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ attempts: [] });

  const params = new URL(request.url).searchParams;
  const problemId = parseInt(params.get('problemId') ?? '', 10);
  if (Number.isNaN(problemId)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const page = Math.max(1, Number(params.get('page') ?? '1'));
  const order = params.get('order') === 'oldest' ? 'asc' : 'desc';
  const [attempts, total] = await Promise.all([prisma.runAttempt.findMany({
    where: { userId: user.id, problemId },
    orderBy: { createdAt: order },
    skip: (page - 1) * 10,
    take: 10,
    select: {
      id: true,
      code: true,
      language: true,
      status: true,
      passedCount: true,
      totalCount: true,
      kind: true,
      createdAt: true,
    },
  }), prisma.runAttempt.count({ where: { userId: user.id, problemId } })]);
  return NextResponse.json({ attempts, total, page, pageSize: 10 });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const body = await request.json().catch(() => null) as { problemId?: number; ids?: string[]; all?: boolean } | null;
  if (!body?.problemId || (!body.all && !body.ids?.length)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  const where = { userId: user.id, problemId: body.problemId, ...(body.all ? {} : { id: { in: body.ids } }) };
  const deleted = await prisma.runAttempt.deleteMany({ where });
  return NextResponse.json({ deleted: deleted.count });
}
