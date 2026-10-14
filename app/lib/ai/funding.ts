// 이 호출은 누가 요금을 내는가 — 한 곳에서만 판단한다.
//
// ── 왜 한 곳인가 ────────────────────────────────────────────────────────────
// 예전에는 라우트마다 따로 판단했고, 그래서 서로 어긋나 있었다. 면접 라우트는
// `aiProvider === 'builtin_ai'`일 때만 서비스 부담으로 봤는데, 실제 호출 경로
// (getProviderFor)는 프로바이더와 무관하게 aiCodeModel을 먼저 해석해 서비스 키로
// 나가고 있었다. 즉 "설정에서 다른 프로바이더를 고르면 한도가 사라지는" 상태였다.
//
// 판단 기준은 하나뿐이다: **이번 호출이 서비스 키로 나가는가.**
//   service  서비스가 요금을 낸다 (HUGGINGFACE_API_KEY) → 사용 한도가 걸린다
//   user     이용자가 요금을 낸다 (본인 API 키 · 로컬 모델) → 한도가 없다
import type { LlmConfig } from './llm-interviewer';
import { DEFAULT_BASE_URLS } from './config';

export type Funding = 'service' | 'user';

/** 이용자 AI 설정 — 키·엔드포인트는 복호화된 평문이다. */
export interface UserAiKeys {
  provider: string;
  model: string | null;
  /** 복호화된 개인 API 키 */
  apiKey: string | null;
  /** 복호화된 로컬/브릿지 엔드포인트 */
  baseUrl: string | null;
}

/** 네이티브 API 각 제공사의 OpenAI 호환 엔드포인트 (provider.ts와 같은 표) */
const OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  grok: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  huggingface: 'https://router.huggingface.co/v1',
  perplexity: 'https://api.perplexity.ai',
};

/**
 * 이용자 자신의 키·엔드포인트로 부를 수 있는 설정을 만든다.
 *
 * 만들 수 있으면 이 호출은 이용자 부담이고 한도가 없다.
 * 만들 수 없으면(키 미등록 등) null — 호출부가 서비스 키 경로로 간다.
 *
 * 로컬/브릿지는 키가 없어도 성립한다. 로컬 서버에는 보통 인증이 없고,
 * 어느 쪽이든 요금이 서비스로 오지 않는다는 점은 같다.
 */
export function userFundedConfig(user: UserAiKeys | null | undefined): LlmConfig | null {
  if (!user) return null;
  const apiKey = user.apiKey?.trim() || null;
  const baseUrl = user.baseUrl?.trim() || null;

  if (user.provider === 'local' || user.provider === 'bridge') {
    const url = baseUrl || DEFAULT_BASE_URLS[user.provider];
    if (!url) return null;
    return { kind: 'openai-compatible', provider: user.provider, baseUrl: url, apiKey, model: user.model };
  }

  if (!apiKey) return null;

  if (user.provider === 'anthropic') return { kind: 'anthropic', apiKey, model: user.model };
  if (user.provider === 'gemini') return { kind: 'gemini', apiKey, model: user.model };

  const base = OPENAI_COMPATIBLE_BASE_URLS[user.provider];
  if (!base) return null;
  return { kind: 'openai-compatible', provider: user.provider, baseUrl: base, apiKey, model: user.model };
}

/** 개인 키나 로컬 엔드포인트를 **등록해 두었는가** — 안내 문구를 고를 때 쓴다. */
export function hasOwnFunding(user: UserAiKeys | null | undefined): boolean {
  return userFundedConfig(user) !== null;
}
