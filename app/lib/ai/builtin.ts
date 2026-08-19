// 자체 debateAI(빌트인 실모델) — 이용자 AI 설정과 무관하게 서비스가 대는 모델이다.
// debateQ 모드와 번역·검색 폴백이 쓴다.
//
// 예전에는 AI_BUILTIN_PROVIDER/MODEL/API_KEY로 별도 상용 키를 하나 더 꽂게 되어 있었다.
// 그러면 같은 서비스가 두 군데(무료 티어 + 빌트인)에 요금을 내게 되고, 둘 중 하나만 설정된
// 상태가 흔해 "어디서는 되고 어디서는 안 되는" 상황이 생겼다.
// 지금은 **Debate Free AI(Hugging Face)와 같은 경로를 쓴다** — 키가 하나면 전부 산다.
//
// 이용자가 debateQ에서 다른 모델을 쓰고 싶으면 설정에서 Free AI 카탈로그의 다른 모델을
// 고르거나 자기 API 키를 등록하면 된다(app/lib/ai/config.ts).
import { getProviderFor, type InterviewerProvider } from './provider';
import { getFreeAiLlmConfig, isFreeAiLive } from './free-ai';
import type { LlmConfig } from './llm-interviewer';

/** 빌트인 면접관 — 서버 키가 없으면 MockInterviewer로 내려간다. */
export function getBuiltinProvider(): InterviewerProvider {
  return getProviderFor(
    isFreeAiLive() ? { aiProvider: 'builtin_ai', aiModel: null, aiApiKey: null, aiBaseUrl: null } : null,
  );
}

/** llmChat용 저수준 config — 키 없으면 null (호출자가 규칙 기반 경로를 고른다) */
export function getBuiltinLlmConfig(): LlmConfig | null {
  return getFreeAiLlmConfig();
}

/** UI 배지용 — 실모델이 살아있는지(키 설정 여부) */
export function isBuiltinLive(): boolean {
  return isFreeAiLive();
}
