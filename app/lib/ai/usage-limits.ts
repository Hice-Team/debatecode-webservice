// AI 사용 한도 — 토큰이 아니라 **횟수**로 센다. 서버 전용(DB를 읽는다).
//
// ── 왜 토큰에서 횟수로 바꿨는가 ─────────────────────────────────────────────
// 토큰 한도는 이용자가 지킬 수 없는 한도다. "오늘 62,400토큰 남음"을 보고 다음 질문을
// 할지 말지 정할 수 있는 사람은 없고, 같은 질문이라도 모델과 답 길이에 따라 소비량이
// 달라져서 같은 행동이 매번 다른 값을 남긴다. 반면 "오늘 15번 중 3번 썼다"는 셀 수 있다.
// 비용 방어라는 목적은 회수 한도로도 똑같이 달성된다 — 출력 상한(effort)이 이미
// 한 번의 호출이 쓸 수 있는 양을 묶어 두기 때문이다.
//
// ── 정책 ───────────────────────────────────────────────────────────────────
//   AI Search   하루 15회
//   debateAI    문제당 하루 10회
//   AI 면접관   한도 없음 — 면접은 흐름이 끊기면 그 자체로 성립하지 않는다.
//               (라운드 수가 이미 상한 역할을 한다 — 최대 8문항)
//
// 한도는 **서비스가 요금을 내는 호출에만** 걸린다. 개인 API 키나 로컬 모델로
// 도는 호출은 이용자 부담이므로 세지 않는다(app/lib/ai/funding.ts).
//
// ── 왜 하루로 리셋하는가 ────────────────────────────────────────────────────
// "문제당 10회"를 영구 누적으로 두면 한 문제를 다시 풀러 왔을 때 열 번을 이미 써 버린
// 상태가 된다. 복습은 이 서비스가 권하는 행동인데 그 행동이 막히는 셈이다.
// 창을 하루로 두면 "문제당 10회"라는 약속은 그대로 지키면서 그 문제가 사라진다.
import { prisma } from '../prisma';

export type AiSurface = 'ai-search' | 'debateai';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SurfacePolicy {
  limit: number;
  windowMs: number;
  /** 한도가 걸리는 단위 — true면 문제별로 따로 센다 */
  perScope: boolean;
  label: string;
  /** 한도를 다 썼을 때 화면에 그대로 띄우는 문구 */
  exhausted: (resetLabel: string) => string;
}

export const AI_USAGE_POLICY: Record<AiSurface, SurfacePolicy> = {
  'ai-search': {
    limit: 15,
    windowMs: DAY_MS,
    perScope: false,
    label: 'AI Search 대화',
    exhausted: (at) =>
      `오늘 쓸 수 있는 AI Search 대화 15회를 모두 사용했습니다. ${at}에 다시 열립니다. ` +
      `설정 › AI에서 내 API 키를 등록하면 한도 없이 쓸 수 있습니다.`,
  },
  debateai: {
    limit: 10,
    windowMs: DAY_MS,
    perScope: true,
    label: 'debateAI 대화',
    exhausted: (at) =>
      `이 문제에서 오늘 쓸 수 있는 debateAI 대화 10회를 모두 사용했습니다. ${at}에 다시 열립니다. ` +
      `설정 › AI에서 내 API 키를 등록하면 한도 없이 쓸 수 있습니다.`,
  },
};

export interface AllowanceState {
  /** 한도가 걸리지 않는 호출(개인 키·로컬 모델)이면 true */
  unlimited: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date | null;
  exhausted: boolean;
}

/** 남은 횟수를 소비하지 않고 본다 — 화면에 "오늘 n회 남음"을 그릴 때. */
export async function peekAiUsage(
  userId: string,
  surface: AiSurface,
  scope = '-',
): Promise<AllowanceState> {
  const policy = AI_USAGE_POLICY[surface];
  const rows = await prisma
    .$queryRaw<{ current_count: number; reset_at: Date }[]>`
      SELECT * FROM public.ai_usage_peek(${userId}::uuid, ${surface}, ${scope})`
    .catch(() => []);

  const row = rows[0];
  const used = Number(row?.current_count ?? 0);
  return {
    unlimited: false,
    used,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - used),
    resetAt: row?.reset_at ?? null,
    exhausted: used >= policy.limit,
  };
}

/**
 * 한 번 쓴 것으로 세고, 이번 호출을 허용할지 돌려준다.
 *
 * 증가와 판정을 SQL 함수 한 번으로 처리한다. 애플리케이션에서 읽고-쓰면 탭 두 개로
 * 동시에 보낸 요청이 같은 값을 읽어 둘 다 통과한다 — 한도를 두겠다면서 탭 두 개에
 * 뚫리는 것은 의미가 없다.
 *
 * DB에 닿지 못하면 **허용한다**(fail open). 로그인 같은 자리와 판단이 반대인데,
 * 여기서 막히면 잃는 것은 비용 몇 푼이고 이용자는 멀쩡한 기능이 죽은 것을 본다.
 * 인증에서는 반대로 막는 쪽이 옳다(app/lib/rate-limit-durable.ts).
 */
export async function consumeAiUsage(input: {
  userId: string;
  surface: AiSurface;
  scope?: string;
  /** 이 호출을 서비스가 부담하는가. false면 세지 않는다. */
  serviceFunded: boolean;
}): Promise<AllowanceState> {
  const policy = AI_USAGE_POLICY[input.surface];
  const scope = policy.perScope ? (input.scope ?? '-') : '-';

  if (!input.serviceFunded) {
    return { unlimited: true, used: 0, limit: policy.limit, remaining: policy.limit, resetAt: null, exhausted: false };
  }

  const rows = await prisma
    .$queryRaw<{ allowed: boolean; current_count: number; reset_at: Date }[]>`
      SELECT * FROM public.ai_usage_hit(
        ${input.userId}::uuid, ${input.surface}, ${scope}, ${policy.limit}::int, ${policy.windowMs}::bigint
      )`
    .catch(() => []);

  const row = rows[0];
  if (!row) {
    // 카운터에 닿지 못했다 — 이용자를 막지 않는다
    return { unlimited: false, used: 0, limit: policy.limit, remaining: policy.limit, resetAt: null, exhausted: false };
  }

  const used = Number(row.current_count);
  return {
    unlimited: false,
    used,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - used),
    resetAt: row.reset_at,
    exhausted: !row.allowed,
  };
}

/**
 * 소비한 횟수를 되돌린다 — 모델이 답하지 못했을 때.
 *
 * 업스트림이 죽어서 빈 응답이 온 것은 이용자 잘못이 아니다. 그 실패로 하루 한도가
 * 줄어들면, 장애가 난 날에 이용자가 두 번 손해를 본다.
 */
export async function refundAiUsage(input: {
  userId: string;
  surface: AiSurface;
  scope?: string;
  serviceFunded: boolean;
}): Promise<void> {
  if (!input.serviceFunded) return;
  const policy = AI_USAGE_POLICY[input.surface];
  const scope = policy.perScope ? (input.scope ?? '-') : '-';

  // $executeRaw를 쓴다. $queryRaw는 결과 행을 역직렬화하려 하는데 이 함수는 void를
  // 돌려주므로 Prisma가 그대로 던진다. 처음엔 $queryRaw + .catch(()=>{})로 두었고,
  // 그래서 **환불이 한 번도 동작하지 않았다** — 조용히 실패하고 있었다.
  // (런타임 QA에서 잡혔다. 화면에는 "실패한 요청은 횟수에서 뺀다"고 적혀 있었다.)
  await prisma
    .$executeRaw`SELECT public.ai_usage_refund(${input.userId}::uuid, ${input.surface}, ${scope})`
    .catch((error) => {
      // 환불 실패는 이용자 요청을 막을 이유가 아니지만, 조용히 넘기면 또 같은 일이 난다
      console.error('[refundAiUsage] 되돌리기 실패', { surface: input.surface, scope, error });
    });
}

/** 한도 소진 안내 문구 — 언제 다시 열리는지를 반드시 함께 말한다. */
export function exhaustedMessage(surface: AiSurface, resetAt: Date | null): string {
  const label = resetAt
    ? resetAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '24시간 뒤';
  return AI_USAGE_POLICY[surface].exhausted(label);
}

/** 만료된 카운터 정리 — 콘솔 › 시스템의 점검 화면에서 부른다. */
export async function sweepAiUsage(): Promise<number> {
  const rows = await prisma
    .$queryRaw<{ ai_usage_sweep: number }[]>`SELECT public.ai_usage_sweep()`
    .catch(() => []);
  return Number(rows[0]?.ai_usage_sweep ?? 0);
}
