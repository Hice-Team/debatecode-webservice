// Debate Free AI — debateCode가 기본 제공하는 실제 AI.
//
// 업스트림은 **Hugging Face Inference Router 하나뿐이다.** 키 하나로 여러 오픈 모델을 부를 수
// 있어서, 제공사마다 계정과 결제 수단을 걸어 두지 않고도 무료 티어를 감당할 수 있다.
// 상용 API(OpenAI·Claude·Gemini·Grok·Perplexity)는 이용자가 자기 키를 등록해서 쓴다.
//
// 사용자별 하루 100,000 토큰을 제공하고, 소진하면 규칙 기반 모델로 내려간다
// (소진 시점 기준 24시간 뒤 초기화).
//
// env:
//   HUGGINGFACE_API_KEY | HF_TOKEN   필수 — 없으면 규칙 기반 폴백
import { prisma } from '../prisma';
import type { LlmConfig } from './llm-interviewer';
import { FREE_AI_DAILY_LIMIT, freeAiRepo } from './free-ai-models';

export {
  FREE_AI_DAILY_LIMIT,
  FREE_AI_DEFAULT_MODEL_ID,
  FREE_AI_REPOS,
  FREE_FALLBACK_REPO,
  freeAiRepo,
} from './free-ai-models';

/**
 * 기본 제공 모델의 호출 설정. 서버 키가 없으면 null(→ 호출자가 규칙 기반으로 내려간다).
 *
 * modelId는 debateAI 카탈로그의 id다. 모르는 값이면 기본 모델로 떨어진다 —
 * 예전에 고를 수 있던 모델이 저장돼 있어도 화면이 깨지지 않게.
 */
export function getFreeAiLlmConfig(modelId?: string | null): LlmConfig | null {
  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN;
  if (!apiKey) return null;
  return {
    kind: 'openai-compatible',
    provider: 'huggingface',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKey,
    model: freeAiRepo(modelId),
  };
}

export function isFreeAiLive(): boolean {
  return Boolean(process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN);
}

// 대략적 토큰 추정 — 프롬프트+응답 문자열 길이 / 4 (한국어·코드 혼용 기준 보수적 근사)
export function estimateTokens(...texts: (string | null | undefined)[]): number {
  const chars = texts.reduce((sum, t) => sum + (t?.length ?? 0), 0);
  return Math.max(1, Math.ceil(chars / 4));
}

export interface FreeAiQuota {
  used: number;
  limit: number;
  resetAt: Date | null; // null = 아직 소비 없음(또는 창 만료됨)
  exhausted: boolean;
  /** 모델 id → 이번 창에서 쓴 토큰. 설정 화면이 모델별로 나눠 보여 줄 때 쓴다. */
  byModel: Record<string, number>;
}

/** JSON 컬럼은 무엇이든 담길 수 있다 — 숫자만 남기고 걸러 읽는다 */
function readUsageMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) out[key] = raw;
  }
  return out;
}

// 남은 쿠터 조회 — 창이 만료됐으면 0부터 다시 시작한 것으로 본다
export async function getFreeAiQuota(userId: string): Promise<FreeAiQuota> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeTokensUsed: true, freeTokensResetAt: true, freeUsageByModel: true },
  });
  if (!u || !u.freeTokensResetAt || u.freeTokensResetAt <= new Date()) {
    return { used: 0, limit: FREE_AI_DAILY_LIMIT, resetAt: null, exhausted: false, byModel: {} };
  }
  return {
    used: u.freeTokensUsed,
    limit: FREE_AI_DAILY_LIMIT,
    resetAt: u.freeTokensResetAt,
    exhausted: u.freeTokensUsed >= FREE_AI_DAILY_LIMIT,
    byModel: readUsageMap(u.freeUsageByModel),
  };
}

/**
 * 사용량 누적 — 첫 소비(또는 창 만료 후 첫 소비) 시 24시간 창을 새로 연다.
 *
 * modelId를 함께 받으면 모델별 내역에도 더한다. 창이 새로 열릴 때 내역도 같이 비워야
 * "어제 쓴 모델"이 오늘 사용량인 척 남지 않는다.
 */
export async function addFreeAiUsage(userId: string, tokens: number, modelId?: string | null): Promise<void> {
  const now = new Date();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeTokensUsed: true, freeTokensResetAt: true, freeUsageByModel: true },
  });
  if (!u) return;

  const fresh = !u.freeTokensResetAt || u.freeTokensResetAt <= now;
  const byModel = fresh ? {} : readUsageMap(u.freeUsageByModel);
  if (modelId) byModel[modelId] = (byModel[modelId] ?? 0) + tokens;

  await prisma.user.update({
    where: { id: userId },
    data: fresh
      ? {
          freeTokensUsed: tokens,
          freeTokensResetAt: new Date(now.getTime() + 24 * 3600 * 1000),
          freeUsageByModel: byModel,
        }
      : { freeTokensUsed: { increment: tokens }, freeUsageByModel: byModel },
  });
}
