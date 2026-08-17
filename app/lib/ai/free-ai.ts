// Debate Free AI — debateCode가 기본 제공하는 실제 AI.
// 운영자 API 키(env)로 여러 상용/오픈 모델을 돌려쓰며, 사용자별 하루 100,000 토큰을 제공한다.
// 토큰 소진 시 규칙 기반 모델로 자동 전환되고, 소진 시점 기준 24시간 뒤 초기화된다.
//
// env (있는 키의 모델만 사용된다 — 카탈로그 순서대로 첫 번째 가용 모델 선택):
//   OPENAI_API_KEY                  ChatGPT API Platform
//   GROQ_API_KEY                    Groq (GPT OSS 20B, Llama)
//   GOOGLE_AI_API_KEY|GEMINI_API_KEY  Google AI Studio (Gemini, Gemma)
//   GROK_API_KEY|XAI_API_KEY        xAI Grok API
//   HUGGINGFACE_API_KEY|HF_TOKEN    Hugging Face (DeepSeek, EXAONE)
import { prisma } from '../prisma';
import type { LlmConfig } from './llm-interviewer';
import { FREE_AI_DAILY_LIMIT, isFreeAiFamily, type FreeAiFamily } from './free-ai-models';

export {
  FREE_AI_DAILY_LIMIT,
  FREE_AI_FAMILIES,
  FREE_AI_MODELS,
  isFreeAiFamily,
  type FreeAiFamily,
  type FreeAiModel,
} from './free-ai-models';

function env(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

// 계열별 LlmConfig — 서버에 해당 계열 키가 없으면 null
function familyConfig(family: FreeAiFamily): LlmConfig | null {
  if (family === 'gemma') {
    const key = env('GOOGLE_AI_API_KEY', 'GEMINI_API_KEY');
    if (!key) return null;
    // Gemma는 system_instruction 미지원 — Google AI Studio의 OpenAI 호환 엔드포인트를 쓴다
    return {
      kind: 'openai-compatible',
      provider: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: key,
      model: process.env.FREE_AI_GEMMA_MODEL || 'gemma-3-27b-it',
    };
  }
  if (family === 'groq') {
    const key = env('GROQ_API_KEY');
    if (!key) return null;
    return {
      kind: 'openai-compatible',
      provider: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: key,
      model: process.env.FREE_AI_GROQ_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  if (family === 'grok') {
    const key = env('GROK_API_KEY', 'XAI_API_KEY');
    if (!key) return null;
    return {
      kind: 'openai-compatible',
      provider: 'grok',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: key,
      model: process.env.FREE_AI_GROK_MODEL || 'grok-4.5',
    };
  }
  const key = env('HUGGINGFACE_API_KEY', 'HF_TOKEN');
  if (!key) return null;
  return {
    kind: 'openai-compatible',
    provider: 'huggingface',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKey: key,
    model: process.env.FREE_AI_HF_MODEL || 'deepseek-ai/DeepSeek-V3',
  };
}

const FAMILY_ORDER: FreeAiFamily[] = ['groq', 'gemma', 'grok', 'huggingface'];

// 사용자가 고른 계열 우선, 키가 없으면 나머지 계열 순서대로 폴백 (전부 없으면 null → 규칙 기반)
export function getFreeAiLlmConfig(preferredFamily?: string | null): LlmConfig | null {
  const order: FreeAiFamily[] = isFreeAiFamily(preferredFamily)
    ? [preferredFamily, ...FAMILY_ORDER.filter((f) => f !== preferredFamily)]
    : FAMILY_ORDER;
  for (const family of order) {
    const config = familyConfig(family);
    if (config) return config;
  }
  return null;
}

export function isFreeAiLive(): boolean {
  return getFreeAiLlmConfig() !== null;
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
