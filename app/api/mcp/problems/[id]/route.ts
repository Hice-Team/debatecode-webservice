import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { authenticateMcp } from '@/app/lib/mcp-auth';
import { rateLimit } from '@/app/lib/rate-limit';

// GET /api/mcp/problems/:id — id(정수) 또는 slug로 상세 조회
export async function GET(request: Request, ctx: RouteContext<'/api/mcp/problems/[id]'>) {
  const user = await authenticateMcp(request);
  if (!user) return NextResponse.json({ error: '유효하지 않은 연동 토큰입니다.' }, { status: 401 });
  if (!rateLimit(`mcp:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: '요청이 너무 잦습니다.' }, { status: 429 });
  }

  const { id } = await ctx.params;
  const numeric = Number.parseInt(id, 10);
  const problem = await prisma.problem.findFirst({
    where: Number.isFinite(numeric) && String(numeric) === id ? { id: numeric } : { slug: id },
    select: {
      id: true, slug: true, title: true, difficulty: true, category: true, tags: true,
      description: true, timeLimitMs: true, starterCodes: true, company: true, examYear: true,
      // 공개 예제 테스트 케이스만 노출 (히든 케이스는 제외)
      testCases: { where: { isHidden: false }, orderBy: { order: 'asc' }, select: { input: true, expected: true }, take: 3 },
    },
  });
  if (!problem) return NextResponse.json({ error: '문제를 찾을 수 없습니다.' }, { status: 404 });
  return NextResponse.json(problem);
}
