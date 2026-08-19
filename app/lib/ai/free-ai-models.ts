// Debate Free AI 카탈로그 — 클라이언트/서버 공용 (서버 전용 의존성 금지).
//
// 기본 제공 모델은 **Hugging Face Inference Router 하나로만** 돌린다.
// 키 하나(HUGGINGFACE_API_KEY)로 여러 오픈 모델을 부를 수 있어서, 제공사마다 계정을 만들고
// 결제 수단을 걸어 두는 일 없이 서비스가 무료 티어를 감당할 수 있다.
//
// OpenAI·Claude·Gemini·Grok·Perplexity 같은 상용 API는 **이용자가 자기 키를 등록해서** 쓴다
// (app/lib/ai/config.ts의 native 그룹). 서비스가 그 요금을 대신 내지 않는다.
//
// 실제 호출·쿠터 로직은 free-ai.ts(서버 전용)에 있다.
// ── 유지보수 메모 ───────────────────────────────────────────────────────────
// 무료 모델을 추가·교체할 때 손대는 곳은 두 군데뿐이다.
//   1) 아래 FREE_AI_REPOS 표에 `모델 id → HF 저장소 경로`를 넣는다.
//   2) 그 id를 debateai-models.ts의 DEBATEAI_MODELS에 tier:'free'로 추가한다(화면 노출용).
// env는 건드릴 필요가 없다. 이미 저장된 이용자 선택값(User.aiModel)이 사라진 id를 가리켜도
// freeAiRepo()가 기본 모델로 떨어뜨리므로 화면이 깨지지 않는다.
//
// 라우터에서 어떤 저장소가 실제로 서빙되는지는 https://huggingface.co/models?inference=warm
// 에서 확인한다. 표에 넣었는데 404/503이 나면 FREE_FALLBACK_REPO로 자동 재시도된다.
// ───────────────────────────────────────────────────────────────────────────
export const FREE_AI_DAILY_LIMIT = 100_000;

/**
 * 라우터에서 무슨 일이 있어도 부를 수 있는 모델.
 *
 * 저장소마다 서빙 여부가 다르고, 어제 되던 모델이 오늘 내려가 있기도 하다.
 * 고른 모델이 404/503으로 막히면 오류를 띄우는 대신 이 모델로 한 번 더 시도한다.
 */
export const FREE_FALLBACK_REPO = 'deepseek-ai/DeepSeek-V3.1';

/** 기본 모델 — 이 서비스는 코드를 다루므로 코드 특화 모델을 기본으로 둔다. */
export const FREE_AI_DEFAULT_MODEL_ID = 'deepseek-coder-v2';

/** debateAI 모델 id → Hugging Face 저장소 경로. */
export const FREE_AI_REPOS: Record<string, string> = {
  // NOTE: DeepSeek V4는 아직 공개 배포본이 없어 현재 최신 플래그십에 매핑해 둔다.
  //       공개되면 이 표만 바꾸면 되고, 저장된 모델 id는 그대로 쓸 수 있다.
  'deepseek-v4-pro': 'deepseek-ai/DeepSeek-V3.1',
  'deepseek-v4-flash': 'deepseek-ai/DeepSeek-V3.1',
  'deepseek-coder-v2': 'deepseek-ai/DeepSeek-Coder-V2-Instruct',
  'deepseek-r1': 'deepseek-ai/DeepSeek-R1',
  'qwen-3.6': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
  'qwen3-coder-next': 'Qwen/Qwen3-Coder-480B-A35B-Instruct',
  'kimi-k3': 'moonshotai/Kimi-K2-Instruct',
  'k-exaone-2.0': 'LGAI-EXAONE/EXAONE-4.0-32B',
  'exaone-4.5': 'LGAI-EXAONE/EXAONE-4.0-32B',
  'exaone-deep': 'LGAI-EXAONE/EXAONE-Deep-32B',
  'solar-pro': 'upstage/solar-pro-preview-instruct',
  'solar-mini': 'upstage/SOLAR-10.7B-Instruct-v1.0',
  'kanana-2': 'kakaocorp/kanana-1.5-8b-instruct',
};

/** 모델 id를 저장소 경로로 옮긴다. 모르는 id면 기본 모델로 떨어진다. */
export function freeAiRepo(modelId?: string | null): string {
  if (modelId && FREE_AI_REPOS[modelId]) return FREE_AI_REPOS[modelId];
  return FREE_AI_REPOS[FREE_AI_DEFAULT_MODEL_ID];
}
