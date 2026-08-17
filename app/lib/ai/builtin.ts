// 자체 debateAI(빌트인 실모델) — 사용자 AI 설정과 무관하게 서버 env 키로 호출한다.
// debateQ 모드가 사용하며, 키 미설정 시 규칙기반(mock)으로 폴백한다.
//
// env:
//   AI_BUILTIN_PROVIDER  anthropic(기본) | gemini | openai | grok | groq | huggingface | local
//   AI_BUILTIN_MODEL     비우면 프로바이더 기본 모델
//   AI_BUILTIN_API_KEY   필수 — 없으면 mock 폴백
//   AI_BUILTIN_BASE_URL  local(OpenAI 호환) 프로바이더용
import { getProviderFor, type InterviewerProvider, type UserAiConfig } from './provider';
import type { LlmConfig } from './llm-interviewer';

export function getBuiltinConfig(): UserAiConfig | null {
  const apiKey = process.env.AI_BUILTIN_API_KEY;
  if (!apiKey) return null;
  return {
    aiProvider: process.env.AI_BUILTIN_PROVIDER || 'anthropic',
    aiModel: process.env.AI_BUILTIN_MODEL || null,
    aiApiKey: apiKey,
    aiBaseUrl: process.env.AI_BUILTIN_BASE_URL || null,
  };
}

// 빌트인 면접관 — 키 없으면 getProviderFor(null) = MockInterviewer
export function getBuiltinProvider(): InterviewerProvider {
  return getProviderFor(getBuiltinConfig());
}

// llmChat용 저수준 config — 키 없으면 null (호출자가 mock 경로 선택)
export function getBuiltinLlmConfig(): LlmConfig | null {
  const cfg = getBuiltinConfig();
  if (!cfg?.aiApiKey) return null;
  if (cfg.aiProvider === 'anthropic') return { kind: 'anthropic', apiKey: cfg.aiApiKey, model: cfg.aiModel };
  if (cfg.aiProvider === 'gemini') return { kind: 'gemini', apiKey: cfg.aiApiKey, model: cfg.aiModel };
  const baseUrls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    grok: 'https://api.x.ai/v1',
    groq: 'https://api.groq.com/openai/v1',
    huggingface: 'https://router.huggingface.co/v1',
  };
  const baseUrl = cfg.aiBaseUrl || baseUrls[cfg.aiProvider];
  if (!baseUrl) return null;
  return { kind: 'openai-compatible', provider: cfg.aiProvider, baseUrl, apiKey: cfg.aiApiKey, model: cfg.aiModel };
}

// UI 배지용 — 실모델이 살아있는지(키 설정 여부)
export function isBuiltinLive(): boolean {
  return !!process.env.AI_BUILTIN_API_KEY;
}
