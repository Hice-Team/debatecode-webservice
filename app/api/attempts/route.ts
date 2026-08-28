import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { requireApiSession } from '@/app/lib/dal';

// 실행/제출 시도 기록 — 워크스페이스 시도횟수 탭의 테이블 데이터.
//
// 기록을 **만드는** 경로는 여기 없다. 예전에는 이 라우트가 POST로 클라이언트가 보낸
// status·passedCount를 그대로 받아 적었는데, 그러면 시도 기록도 이용자가 쓰는 값이 된다.
// 지금은 /api/judge/verify가 서버 판정과 함께 기록까지 남긴다(app/lib/judge/server.ts).
// 여기 남은 것은 읽기와 삭제뿐이다.

const PAGE_SIZE = 10;

export async function GET(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) return NextResponse.json({ attempts: [], total: 0 });

  const params = new URL(request.url).searchParams;
  const problemId = Number.parseInt(params.get('problemId') ?? '', 10);
  if (!Number.isInteger(problemId)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const page = Math.max(1, Math.min(1000, Number(params.get('page') ?? '1') || 1));
  const order = params.get('order') === 'oldest' ? 'asc' : 'desc';

  const where = { userId: session.userId, problemId };
  const [attempts, total] = await Promise.all([
    prisma.runAttempt.findMany({
      where,
      orderBy: { createdAt: order },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
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
    }),
    prisma.runAttempt.count({ where }),
  ]);

  return NextResponse.json({ attempts, total, page, pageSize: PAGE_SIZE });
}

export async function DELETE(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;

  const body = (await request.json().catch(() => null)) as {
    problemId?: number;
    ids?: string[];
    all?: boolean;
  } | null;

  if (!body?.problemId || (!body.all && !body.ids?.length)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  // 소유 조건(userId)을 where에 함께 걸어 남의 기록이 지워지지 않게 한다
  const deleted = await prisma.runAttempt.deleteMany({
    where: {
      userId: session.userId,
      problemId: body.problemId,
      ...(body.all ? {} : { id: { in: body.ids!.slice(0, 200) } }),
    },
  });
  return NextResponse.json({ deleted: deleted.count });
}
