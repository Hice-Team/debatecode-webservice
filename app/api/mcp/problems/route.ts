import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { Prisma } from '@/app/generated/prisma';
import { authenticateMcp } from '@/app/lib/mcp-auth';
import { rateLimit } from '@/app/lib/rate-limit';

// GET /api/mcp/problems?q=&difficulty=&company=&language=&limit=
export async function GET(request: Request) {
  const user = await authenticateMcp(request);
  if (!user) return NextResponse.json({ error: '유효하지 않은 연동 토큰입니다.' }, { status: 401 });
  if (!rateLimit(`mcp:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: '요청이 너무 잦습니다.' }, { status: 429 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() || undefined;
  const difficultyRaw = url.searchParams.get('difficulty');
  const difficulty = difficultyRaw ? Number.parseInt(difficultyRaw, 10) : undefined;
  const company = url.searchParams.get('company')?.trim() || undefined;
  const language = url.searchParams.get('language')?.trim()?.toLowerCase() || undefined;
  const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20));

  // 언어 필터를 DB에서 건다.
  //
  // 예전에는 200행을 가져와 앱에서 걸렀다. 문제가 200개를 넘는 순간 결과가 조용히
  // 불완전해진다 — 조건에 맞는데도 뒤쪽 문제는 나오지 않는다. starterCodes가 jsonb이므로
  // 키 존재 여부는 DB가 판단할 수 있다.
  const problems = await prisma.problem.findMany({
    where: {
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      ...(Number.isFinite(difficulty) ? { difficulty } : {}),
      ...(company ? { company } : {}),
      ...(language ? { starterCodes: { path: [language], not: Prisma.DbNull } } : {}),
    },
    orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
    select: {
      id: true, slug: true, title: true, difficulty: true, category: true,
      company: true, tags: true,
    },
    take: limit,
  });

  return NextResponse.json({ count: problems.length, problems });
}
