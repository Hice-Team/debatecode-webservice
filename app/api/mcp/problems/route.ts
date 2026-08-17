import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
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

  const problems = await prisma.problem.findMany({
    where: {
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {}),
      ...(Number.isFinite(difficulty) ? { difficulty } : {}),
      ...(company ? { company } : {}),
    },
    orderBy: [{ difficulty: 'asc' }, { id: 'asc' }],
    select: {
      id: true, slug: true, title: true, difficulty: true, category: true,
      company: true, tags: true, starterCodes: language ? true : false,
    },
    take: language ? 200 : limit,
  });

  // 언어 필터는 starterCodes(JSON) 키 존재 여부로 in-memory 처리
  const filtered = (language
    ? problems.filter((p) => (p.starterCodes as Record<string, unknown> | null)?.[language] != null)
    : problems
  ).slice(0, limit).map(({ starterCodes: _s, ...rest }) => rest);

  return NextResponse.json({ count: filtered.length, problems: filtered });
}
