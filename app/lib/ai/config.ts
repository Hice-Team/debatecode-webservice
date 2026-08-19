// AI 프로바이더 메타데이터 — 클라이언트/서버 공용 (구현체 import 금지)
//
// 고를 수 있는 길은 두 갈래뿐이다.
//   내장 면접관   DebateAI Free Tier — 키 없이 바로. 운영자 키로 돌고 계열별 일일 한도가 있다.
//   네이티브 API  본인 API 키를 직접 연결 — debateAI 탭·AI Search·면접관 전부에서 쓰인다.
//
// hidden  목록에 띄우지 않지만 저장값으로는 유효하다. `mock`은 Free Tier 한도를 다 쓴 뒤
//         자동으로 돌아가는 자리라서 선택지에서만 빼고 값 자체는 살려 둔다.
// locked  아직 고를 수 없다 — UI에서 잠기고 서버 액션도 거부한다.
//
// ── 유지보수 메모 ───────────────────────────────────────────────────────────
// 상용 API는 **전부 이용자 키(BYOK)**다. 서비스가 요금을 대는 것은 Hugging Face 하나뿐이고,
// 그 키는 HUGGINGFACE_API_KEY 한 개다(app/lib/ai/free-ai.ts).
//
// 새 상용 제공사를 붙이려면 네 곳을 함께 고친다 — 하나라도 빠뜨리면 "목록엔 보이는데
// 저장이 안 되는" 상태가 된다:
//   1) 아래 AI_PROVIDERS에 group:'native'로 추가
//   2) DEFAULT_MODELS · KEY_HINTS · KEY_CONSOLE_URLS에 같은 key로 항목 추가
//   3) provider.ts의 OPENAI_COMPATIBLE_BASE_URLS (OpenAI 호환이 아니면 분기 추가)
//   4) debateai-models.ts의 DEBATEAI_MODELS에 tier:'byok'로,
//      debateai-upstream.ts의 COMMERCIAL 표에 호출 규격 추가
// ───────────────────────────────────────────────────────────────────────────
export const AI_PROVIDERS = [
  // 내장 면접관 — Free Tier 하나만 남긴다
  { key: 'builtin_ai', label: 'DebateAI Free Tier', group: 'default', needsKey: false, needsUrl: false, locked: false, hidden: false },
  // 규칙 기반 — 한도 소진 시의 폴백. 직접 고르는 대상이 아니다
  { key: 'mock', label: '규칙 기반 모델', group: 'default', needsKey: false, needsUrl: false, locked: false, hidden: true },

  // 내 컴퓨터에서 실행 — 화면에는 남기되 아직 고를 수 없다
  { key: 'bridge', label: 'debateBridge (Electron + Ollama)', group: 'local', needsKey: false, needsUrl: true, locked: true, hidden: false },
  { key: 'local', label: '로컬 LLM (OpenAI 호환)', group: 'local', needsKey: false, needsUrl: true, locked: true, hidden: false },

  // 네이티브 API — 각 제공사 공식 엔드포인트에 본인 키로 붙는다
  { key: 'anthropic', label: 'Anthropic Claude', group: 'native', needsKey: true, needsUrl: false, locked: false, hidden: false },
  { key: 'openai', label: 'OpenAI ChatGPT', group: 'native', needsKey: true, needsUrl: false, locked: false, hidden: false },
  { key: 'gemini', label: 'Google Gemini', group: 'native', needsKey: true, needsUrl: false, locked: false, hidden: false },
  { key: 'grok', label: 'xAI Grok', group: 'native', needsKey: true, needsUrl: false, locked: false, hidden: false },
  { key: 'perplexity', label: 'Perplexity', group: 'native', needsKey: true, needsUrl: false, locked: false, hidden: false },
] as const;

export type AiProviderKey = (typeof AI_PROVIDERS)[number]['key'];

export const LOCKED_PROVIDERS = new Set<string>(AI_PROVIDERS.filter((p) => p.locked).map((p) => p.key));

/** 이용자가 실제로 고를 수 있는 값 — 서버 액션의 화이트리스트이기도 하다. */
export const SELECTABLE_PROVIDERS = AI_PROVIDERS.filter((p) => !p.locked && !p.hidden);

export function isSelectableProvider(key: string): boolean {
  return SELECTABLE_PROVIDERS.some((p) => p.key === key);
}

/**
 * 저장된 값을 화면에 쓸 수 있는 값으로 좁힌다.
 *
 * 예전에 고를 수 있던 클라우드 API(groq·huggingface)나 잠긴 로컬 실행이 남아 있으면
 * Free Tier로 되돌린다 — 없어진 선택지가 선택된 척 보이는 것이 가장 나쁘다.
 */
export function normalizeProvider(stored: string | null | undefined): AiProviderKey {
  if (stored && isSelectableProvider(stored)) return stored as AiProviderKey;
  return 'builtin_ai';
}

/** 네이티브 API 각 제공사의 기본 모델 — 비워 두면 이 값으로 호출한다. */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.1',
  gemini: 'gemini-2.5-flash',
  grok: 'grok-4.5',
  perplexity: 'sonar-pro',
  local: 'llama3.1',
  bridge: 'llama3.1',
};

/** 네이티브 API 키 형식 힌트 — 붙여넣기 전에 어느 키인지 알 수 있게 한다. */
export const KEY_HINTS: Record<string, string> = {
  anthropic: 'sk-ant-…',
  openai: 'sk-…',
  gemini: 'AIza…',
  grok: 'xai-…',
  perplexity: 'pplx-…',
};

/** 키를 발급받는 곳 — 설정 화면에서 바로 이동한다. */
export const KEY_CONSOLE_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/apikey',
  grok: 'https://console.x.ai',
  perplexity: 'https://www.perplexity.ai/account/api/keys',
};

export const DEFAULT_BASE_URLS: Record<string, string> = {
  bridge: 'http://localhost:4141/v1',
  local: 'http://localhost:11434/v1',
};
