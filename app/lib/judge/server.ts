// 채점 서버 계층 — 무엇이 통과인지 결정하는 곳.
//
// ── 왜 이렇게 바꿨는가 ───────────────────────────────────────────────────────
// 예전 흐름은 이랬다. 브라우저가 코드를 돌리고 `{status:'PASS', passedCount:10}`을
// 서버로 보내면, 서버는 그 값을 그대로 믿고 스타점수와 디베이트포인트를 지급했다.
// 채점기가 브라우저에 있으니 그 값은 이용자가 정하는 값이다. 그리고 그 포인트는
// 기프티콘으로 나간다 — 결제 금액을 클라이언트가 정하는 구조였던 셈이다.
// 히든 테스트케이스도 기대 출력까지 통째로 브라우저로 내려가고 있어서, 사실상
// 숨겨진 것이 없었다.
//
// ── 지금 흐름 ───────────────────────────────────────────────────────────────
//   1. open()    서버가 채점 세션을 열고 **입력만** 내려보낸다. 기대 출력은 나가지 않는다.
//   2. (브라우저) 워커가 코드를 돌려 케이스별 **실제 출력**을 만든다. 비교는 하지 않는다.
//   3. verify()  서버가 기대 출력과 대조해 pass/fail을 **직접 판정**하고 기록한다.
//
// 이용자는 이제 "통과했다"고 주장할 수 없다. 통과하려면 정답 출력을 만들어 내야 하고,
// 그러려면 실제로 문제를 풀어야 한다.
//
// ── 남는 한계 ───────────────────────────────────────────────────────────────
// 코드 실행 자체는 여전히 브라우저에 있다. Cloudflare Workers에는 임의 코드를 격리해
// 돌릴 자리가 없기 때문이다. 그래서 "남의 정답 코드를 받아서 돌린 결과를 낸다"는
// 막지 못한다 — 다만 그건 서버 실행기가 있어도 코드를 베끼면 똑같이 통과하므로
// 위험의 성격이 다르지 않다. 실행기를 서버로 옮기게 되면 2단계만 갈아 끼우면 되고
// 이 계약(open/verify)은 그대로 남는다.
import { prisma } from '../prisma';
import { sha256Hex } from '../hash';
import { judgeEqual } from './compare';
import type { Language } from '../types';

/** 세션 수명 — 문제를 오래 붙잡고 있어도 채점 자체는 몇 초 안에 끝난다. */
const SESSION_TTL_MS = 10 * 60 * 1000;

/** 한 번에 채점할 수 있는 케이스 수 상한 — 요청 본문이 무한정 커지지 않게. */
const MAX_CASES = 200;

export type JudgeKind = 'run' | 'submit';

export interface OpenedSession {
  sessionId: string;
  /** 기대 출력은 들어 있지 않다 — 의도적이다. */
  cases: Array<{ id: number; args: unknown[]; isHidden: boolean }>;
  timeLimitMs: number;
  expiresAt: string;
}

export type OpenResult = OpenedSession | { error: string; status: number };

/**
 * 채점 세션을 연다.
 *
 * kind에 따라 내려보내는 케이스가 다르다.
 *   run     예제 케이스만 — 풀이 중 즉시 확인용
 *   submit  전체(히든 포함) — 점수와 포인트가 걸린 판정
 */
export async function openJudgeSession(input: {
  userId: string | null;
  problemId: number;
  language: Language;
  code: string;
  kind: JudgeKind;
}): Promise<OpenResult> {
  const problem = await prisma.problem.findUnique({
    where: { id: input.problemId },
    select: {
      id: true,
      timeLimitMs: true,
      testCases: {
        orderBy: { order: 'asc' },
        select: { id: true, input: true, isHidden: true },
      },
    },
  });
  if (!problem) return { error: '존재하지 않는 문제입니다.', status: 404 };

  // 제출은 로그인 뒤에만 가능하다 — 기록과 보상이 계정에 붙기 때문이다.
  if (input.kind === 'submit' && !input.userId) {
    return { error: '제출하려면 로그인이 필요합니다.', status: 401 };
  }

  const pool = input.kind === 'submit' ? problem.testCases : problem.testCases.filter((c) => !c.isHidden);
  if (pool.length === 0) {
    return { error: '이 문제에는 채점할 테스트케이스가 없습니다.', status: 409 };
  }
  if (pool.length > MAX_CASES) {
    return { error: '테스트케이스가 너무 많습니다. 운영자에게 알려 주세요.', status: 409 };
  }

  const codeHash = await sha256Hex(input.code);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const session = await prisma.judgeSession.create({
    data: {
      userId: input.userId,
      problemId: problem.id,
      language: input.language,
      codeHash,
      kind: input.kind,
      caseIds: pool.map((c) => c.id),
      expiresAt,
    },
    select: { id: true },
  });

  return {
    sessionId: session.id,
    cases: pool.map((c) => ({
      id: c.id,
      args: (c.input as unknown[]) ?? [],
      isHidden: c.isHidden,
    })),
    timeLimitMs: problem.timeLimitMs,
    expiresAt: expiresAt.toISOString(),
  };
}

/* ---------- 판정 ---------- */

/** 브라우저 워커가 케이스마다 돌려주는 것 — 실행 결과이지 판정이 아니다. */
export interface CaseOutcome {
  id: number;
  /** 정상 종료 | 예외 | 시간 초과 */
  outcome: 'returned' | 'error' | 'timeout';
  /** outcome이 'returned'일 때의 반환값 */
  actual?: unknown;
  stdout?: string;
  timeMs?: number;
  errorMessage?: string;
}

/** 서버가 내린 케이스별 판정 — 화면에 그대로 그린다. */
export interface JudgedCase {
  id: number;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  isHidden: boolean;
  stdout: string;
  timeMs: number;
  errorMessage?: string;
  /** 히든 케이스에는 담기지 않는다 — 한 건씩 흘리면 결국 전부 새어 나간다. */
  actual?: unknown;
  expected?: unknown;
}

export interface Verdict {
  status: 'PASS' | 'FAIL' | 'ERROR' | 'TIMEOUT';
  passed: number;
  total: number;
  maxTimeMs: number;
  results: JudgedCase[];
}

/** 판정 결과 + 그 판정이 어느 문제·어느 모드였는지. 기록은 호출부(라우트)가 한다. */
export interface JudgedSession {
  verdict: Verdict;
  problem: { id: number; title: string; difficulty: number; category: string; keywords: unknown };
  language: Language;
  kind: JudgeKind;
}

export type VerifyResult = { judged: JudgedSession } | { error: string; status: number };

/**
 * 워커가 만든 출력을 기대 출력과 대조해 판정하고 기록한다.
 *
 * 여기서 지키는 것들:
 *   · 세션은 1회용이다. 같은 세션으로 두 번 제출할 수 없다.
 *   · 코드 지문이 세션을 열 때와 같아야 한다 — 예제로 세션을 열고 다른 코드를 낼 수 없다.
 *   · 세션이 요구한 케이스가 **전부** 와야 한다. 어려운 케이스를 빼고 내는 것을 막는다.
 *   · 실행 시간은 문제의 제한 시간으로 자른다 — 신고값을 그대로 기록하지 않는다.
 */
export async function verifyJudgeSession(input: {
  sessionId: string;
  userId: string | null;
  code: string;
  outcomes: CaseOutcome[];
}): Promise<VerifyResult> {
  const session = await prisma.judgeSession.findUnique({
    where: { id: input.sessionId },
    select: {
      id: true,
      userId: true,
      problemId: true,
      language: true,
      codeHash: true,
      kind: true,
      caseIds: true,
      consumedAt: true,
      expiresAt: true,
    },
  });
  if (!session) return { error: '채점 세션을 찾을 수 없습니다. 다시 실행해 주세요.', status: 404 };
  if (session.userId !== input.userId) {
    return { error: '채점 세션을 찾을 수 없습니다. 다시 실행해 주세요.', status: 404 };
  }
  if (session.consumedAt) return { error: '이미 채점된 요청입니다.', status: 409 };
  if (session.expiresAt <= new Date()) {
    return { error: '채점 세션이 만료되었습니다. 다시 실행해 주세요.', status: 410 };
  }

  const codeHash = await sha256Hex(input.code);
  if (codeHash !== session.codeHash) {
    return { error: '채점한 코드와 제출한 코드가 다릅니다. 다시 실행해 주세요.', status: 409 };
  }

  const expectedIds = (session.caseIds as number[]) ?? [];
  const byId = new Map(input.outcomes.map((o) => [o.id, o]));
  const missing = expectedIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return { error: '채점 결과가 일부 누락되었습니다. 다시 실행해 주세요.', status: 400 };
  }

  // 세션을 먼저 닫는다. 판정 도중 실패하더라도 같은 세션이 재사용되면 안 된다.
  const claimed = await prisma.judgeSession.updateMany({
    where: { id: session.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (claimed.count === 0) return { error: '이미 채점된 요청입니다.', status: 409 };

  const [problem, cases] = await Promise.all([
    prisma.problem.findUnique({
      where: { id: session.problemId },
      select: { id: true, title: true, difficulty: true, timeLimitMs: true, keywords: true, category: true },
    }),
    prisma.testCase.findMany({
      where: { id: { in: expectedIds } },
      select: { id: true, expected: true, isHidden: true },
    }),
  ]);
  if (!problem) return { error: '존재하지 않는 문제입니다.', status: 404 };

  const expectedById = new Map(cases.map((c) => [c.id, c]));

  const results: JudgedCase[] = [];
  let passed = 0;
  let maxTimeMs = 0;
  let sawError = false;
  let sawTimeout = false;

  for (const id of expectedIds) {
    const outcome = byId.get(id)!;
    const truth = expectedById.get(id);
    // 세션이 요구한 케이스가 그사이 지워진 경우 — 채점 대상에서 뺀다
    if (!truth) continue;

    const timeMs = clampTime(outcome.timeMs, problem.timeLimitMs);
    maxTimeMs = Math.max(maxTimeMs, timeMs);
    const stdout = truncate(outcome.stdout ?? '', 4_000);

    if (outcome.outcome === 'timeout') {
      sawTimeout = true;
      results.push({ id, status: 'timeout', isHidden: truth.isHidden, stdout, timeMs, errorMessage: '시간 초과' });
      continue;
    }
    if (outcome.outcome === 'error') {
      sawError = true;
      results.push({
        id,
        status: 'error',
        isHidden: truth.isHidden,
        stdout,
        timeMs,
        errorMessage: truncate(outcome.errorMessage ?? '실행 중 오류가 발생했습니다.', 500),
      });
      continue;
    }

    const ok = judgeEqual(outcome.actual ?? null, truth.expected);
    if (ok) passed += 1;
    results.push({
      id,
      status: ok ? 'pass' : 'fail',
      isHidden: truth.isHidden,
      stdout,
      timeMs,
      // 히든 케이스는 결과만 알려 준다. 실패할 때마다 기대 출력을 보여 주면
      // 몇 번 틀려 보는 것만으로 히든 케이스 전체를 복원할 수 있다.
      ...(truth.isHidden ? {} : { actual: outcome.actual ?? null, expected: truth.expected }),
    });
  }

  const total = results.length;
  const allPass = total > 0 && passed === total;
  const status: Verdict['status'] = allPass ? 'PASS' : sawTimeout ? 'TIMEOUT' : sawError ? 'ERROR' : 'FAIL';

  const verdict: Verdict = {
    status,
    passed,
    total,
    maxTimeMs: Math.round(maxTimeMs * 100) / 100,
    results,
  };

  return {
    judged: {
      verdict,
      problem: {
        id: problem.id,
        title: problem.title,
        difficulty: problem.difficulty,
        category: problem.category,
        keywords: problem.keywords,
      },
      language: session.language as Language,
      kind: session.kind as JudgeKind,
    },
  };
}

/* ---------- 보조 ---------- */

/**
 * 실행 시간은 신고값을 그대로 믿지 않는다.
 *
 * 이 값은 순위표에 쓰이고("최고 기록"), 브라우저에서 온 숫자다. 음수나 0.0001ms 같은
 * 값이 들어오면 기록판이 무의미해진다. 문제의 제한 시간이 자연스러운 상한이다.
 */
function clampTime(value: number | undefined, limitMs: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, limitMs);
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export { SESSION_TTL_MS, MAX_CASES };
