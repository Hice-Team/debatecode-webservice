import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiSession } from '@/app/lib/dal';
import { rateLimit } from '@/app/lib/rate-limit';
import { durableRateLimit, retryAfterLabel } from '@/app/lib/rate-limit-durable';
import { getLimit } from '@/app/lib/settings';
import { openJudgeSession } from '@/app/lib/judge/server';

// POST /api/judge/session — 채점 세션을 연다.
//
// 응답에는 **입력만** 들어 있다. 기대 출력은 서버에 남는다(app/lib/judge/server.ts).
// 브라우저는 코드를 돌려 실제 출력을 만들고 /api/judge/verify로 되보낸다.
//
// run    예제 케이스만. 비로그인도 허용한다 — 점수가 걸리지 않고, 문제 화면에서
//        예제는 어차피 보이는 값이다.
// submit 전체(히든 포함). 로그인 필수 — 기록과 보상이 계정에 붙는다.
const schema = z.object({
  problemId: z.number().int().positive(),
  language: z.enum(['javascript', 'python']),
  code: z.string().min(1).max(50_000),
  kind: z.enum(['run', 'submit']).default('run'),
});

export async function POST(request: Request) {
  const session = await getApiSession();
  const userId = session?.userId ?? null;

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { problemId, language, code, kind } = parsed.data;

  if (kind === 'submit' && !userId) {
    return NextResponse.json({ error: '제출하려면 로그인이 필요합니다.' }, { status: 401 });
  }

  // 실행은 잦은 동작이라 인메모리로 충분하다. 제출은 기록과 포인트가 걸려 있어
  // 인스턴스가 바뀌어도 세지는 카운터로 막는다 — Workers에서는 인메모리가 남지 않는다.
  if (kind === 'submit') {
    const limit = await getLimit('limit.rate.submission');
    const gate = await durableRateLimit(`submit:${userId}`, limit, 60_000);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: `제출이 너무 잦습니다. ${retryAfterLabel(gate.retryAfterMs)} 뒤에 다시 시도해 주세요.` },
        { status: 429 },
      );
    }
  } else {
    const key = userId ?? request.headers.get('x-forwarded-for') ?? 'anon';
    if (!rateLimit(`judge-run:${key}`, 60, 60_000)) {
      return NextResponse.json({ error: '실행이 너무 잦습니다. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
    }
  }

  const opened = await openJudgeSession({ userId, problemId, language, code, kind });
  if ('error' in opened) return NextResponse.json({ error: opened.error }, { status: opened.status });

  return NextResponse.json(opened, { headers: { 'Cache-Control': 'no-store' } });
}
