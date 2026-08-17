import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { authenticateMcp } from '@/app/lib/mcp-auth';
import { rateLimit } from '@/app/lib/rate-limit';

// GET /api/mcp/progress — 연동 계정의 풀이/방어 점수 요약
export async function GET(request: Request) {
  const user = await authenticateMcp(request);
  if (!user) return NextResponse.json({ error: '유효하지 않은 연동 토큰입니다.' }, { status: 401 });
  if (!rateLimit(`mcp:${user.id}`, 120, 60_000)) {
    return NextResponse.json({ error: '요청이 너무 잦습니다.' }, { status: 429 });
  }

  const [solved, passes] = await Promise.all([
    prisma.submission.findMany({
      where: { userId: user.id, status: 'PASS' },
      select: { problemId: true, interview: { select: { defenseScore: true } } },
      distinct: ['problemId'],
    }),
    prisma.submission.count({ where: { userId: user.id, status: 'PASS' } }),
  ]);

  const scores = solved.map((s) => s.interview?.defenseScore).filter((v): v is number => typeof v === 'number');
  const avgDefense = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return NextResponse.json({
    solvedProblems: solved.length,
    totalPasses: passes,
    avgDefenseScore: avgDefense,
  });
}
