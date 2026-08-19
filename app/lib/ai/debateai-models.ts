// debateAI 챗봇 모델 카탈로그 — 클라이언트/서버 공용.
// 실제 API 엔드포인트·키 매핑은 서버 라우트(app/api/debateai)에만 둔다.
//
// 티어가 넷이고, 각각 "무엇이 있어야 쓸 수 있는가"가 다르다.
//   free   서비스가 키를 대는 기본 제공 모델. 누구나 바로 쓴다(일일 토큰 쿠터 적용).
//          업스트림은 Hugging Face 하나뿐이다(app/lib/ai/free-ai-models.ts).
//   byok   이용자가 설정에서 자기 API 키를 등록해야 쓴다. 서비스는 이 요금을 대지 않는다.
//   local  이용자 컴퓨터에서 도는 모델(Ollama/debateBridge) 또는 debateNetwork(MCP).

export type ModelTier = 'free' | 'byok' | 'local';

/**
 * 무엇에 쓰는 모델인가 — Free Tier는 열세 개나 되어 이름만으로는 고를 수 없다.
 * 티어(누가 돈을 내는가)와 축이 다르므로 따로 둔다.
 */
export type ModelRole = 'reasoning' | 'fast' | 'code' | 'agent';

export interface DebateAiModel {
  id: string;
  label: string;
  vendor: string;
  tier: ModelTier;
  /** 기능 분류 — Free Tier 목록을 이 기준으로 나눠 보여 준다 */
  role?: ModelRole;
  /** 한 줄 특징 — 드롭다운에서 고르는 근거가 된다 */
  hint?: string;
}

export const ROLE_LABELS: Record<ModelRole, string> = {
  reasoning: '추론',
  fast: '빠른 답변',
  code: '코드 생성',
  agent: '에이전트',
};

export const ROLE_NOTES: Record<ModelRole, string> = {
  reasoning: '오래 생각하고 근거를 따진다 — 설계·복잡도 질문',
  fast: '짧게 자주 물을 때 — 개념 확인·번역',
  code: '구현과 디버깅 — 코드를 직접 만든다',
  agent: '긴 문맥을 들고 코드를 고쳐 나간다 — Agent 모드 권장',
};

/** Free Tier를 기능별로 보여 줄 때의 순서 */
export const ROLE_ORDER: ModelRole[] = ['reasoning', 'fast', 'code', 'agent'];

export const TIER_LABELS: Record<ModelTier, string> = {
  free: 'Free Tier',
  byok: 'Pro Tier — 내 API 키',
  local: 'Local',
};

export const TIER_NOTES: Record<ModelTier, string> = {
  free: '기본 제공 — 일일 토큰 한도 안에서 바로 사용',
  byok: '설정에서 내 API 키를 등록하면 열린다 — 요금은 그 키의 계정으로 청구된다',
  local: '내 컴퓨터에서 실행 — debateBridge 앱 또는 debateNetwork(MCP) 필요',
};

export const DEBATEAI_MODELS: DebateAiModel[] = [
  /* ---------- Free Tier — 기능별 ---------- */
  // 추론
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', vendor: 'DeepSeek', tier: 'free', role: 'reasoning', hint: '플래그십 — 복합 추론' },
  { id: 'deepseek-r1', label: 'DeepSeek R1', vendor: 'DeepSeek', tier: 'free', role: 'reasoning', hint: '단계적 추론' },
  { id: 'exaone-deep', label: 'EXAONE Deep', vendor: 'LG AI Research', tier: 'free', role: 'reasoning', hint: '추론 특화 — 한국어' },
  // 빠른 답변
  { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', vendor: 'DeepSeek', tier: 'free', role: 'fast', hint: '빠른 응답' },
  { id: 'qwen-3.6', label: 'Qwen 3.6', vendor: 'Alibaba', tier: 'free', role: 'fast', hint: '범용 다국어' },
  { id: 'k-exaone-2.0', label: 'K-EXAONE 2.0', vendor: 'LG AI Research', tier: 'free', role: 'fast', hint: '한국어 특화' },
  { id: 'exaone-4.5', label: 'EXAONE 4.5', vendor: 'LG AI Research', tier: 'free', role: 'fast', hint: '한국어 범용' },
  { id: 'solar-pro', label: 'Solar Pro', vendor: 'Upstage', tier: 'free', role: 'fast', hint: '한국어 플래그십' },
  { id: 'solar-mini', label: 'Solar Mini', vendor: 'Upstage', tier: 'free', role: 'fast', hint: '경량·고속' },
  { id: 'kanana-2', label: 'Kanana 2', vendor: 'Kakao', tier: 'free', role: 'fast', hint: '한국어 대화' },
  // 코드 생성
  { id: 'deepseek-coder-v2', label: 'DeepSeek Coder-V2', vendor: 'DeepSeek', tier: 'free', role: 'code', hint: '코드 특화 — 구현·디버깅' },
  // 에이전트
  { id: 'qwen3-coder-next', label: 'Qwen3-Coder-Next', vendor: 'Alibaba', tier: 'free', role: 'agent', hint: '코드 에이전트 — 여러 파일·긴 수정' },
  { id: 'kimi-k3', label: 'Kimi K3', vendor: 'Moonshot AI', tier: 'free', role: 'agent', hint: '긴 문맥 — 대화를 오래 끌고 간다' },

  /* ---------- BYOK — 이용자 API 키 ---------- */
  { id: 'chatgpt', label: 'ChatGPT', vendor: 'OpenAI', tier: 'byok' },
  { id: 'gemini', label: 'Gemini', vendor: 'Google', tier: 'byok' },
  { id: 'claude', label: 'Claude', vendor: 'Anthropic', tier: 'byok' },
  { id: 'grok', label: 'Grok', vendor: 'xAI', tier: 'byok' },
  { id: 'perplexity', label: 'Perplexity', vendor: 'Perplexity', tier: 'byok' },

  /* ---------- Local ---------- */
  { id: 'ollama-auto', label: 'Ollama (자동 감지)', vendor: 'debateBridge', tier: 'local', hint: '로컬에서 실행 중인 모델' },
  { id: 'debate-network', label: 'debateNetwork (MCP)', vendor: 'MCP', tier: 'local', hint: '로컬·온라인 모두 연결' },
];

export type DebateAiModelId = string;

export const DEBATEAI_MODEL_IDS = DEBATEAI_MODELS.map((m) => m.id) as [string, ...string[]];

/**
 * 면접·리팩토링 모드의 기본 모델.
 * 두 모드 모두 "이미 쓰인 코드"를 읽고 따지는 일이라 코드 특화 모델을 기본으로 둔다.
 * 이용자는 설정 → 서비스에서 바꿀 수 있다(User.aiCodeModel).
 */
export const DEFAULT_CODE_MODEL_ID = 'deepseek-coder-v2';

/** 학습 도우미(문제 풀이 중 질문)의 기본 모델. */
export const DEFAULT_CHAT_MODEL_ID = 'deepseek-v4-flash';

export function isDebateAiModelId(value: unknown): value is DebateAiModelId {
  return typeof value === 'string' && DEBATEAI_MODELS.some((m) => m.id === value);
}

export function findDebateAiModel(id: string | null | undefined): DebateAiModel {
  return DEBATEAI_MODELS.find((m) => m.id === id) ?? DEBATEAI_MODELS[0];
}

/** 티어 순서대로 묶어 준다 — 드롭다운의 큰 묶음이 된다. */
export function groupedModels(): Array<{ tier: ModelTier; models: DebateAiModel[] }> {
  const order: ModelTier[] = ['free', 'byok', 'local'];
  return order
    .map((tier) => ({ tier, models: DEBATEAI_MODELS.filter((m) => m.tier === tier) }))
    .filter((g) => g.models.length > 0);
}

/**
 * 한 티어 안을 기능별로 다시 나눈다.
 * role이 없는 모델(BYOK·Local)은 나누지 않고 한 덩어리(role: null)로 돌려준다.
 */
export function groupByRole(models: DebateAiModel[]): Array<{ role: ModelRole | null; models: DebateAiModel[] }> {
  const roled = ROLE_ORDER.map((role) => ({ role, models: models.filter((m) => m.role === role) })).filter(
    (g) => g.models.length > 0,
  );
  const rest = models.filter((m) => !m.role);
  return rest.length > 0 ? [...roled, { role: null, models: rest }] : roled;
}

/**
 * 이 이용자가 그 모델을 실제로 호출할 수 있는가.
 * 못 쓰는 경우 이유를 함께 돌려줘 화면에서 그대로 안내한다.
 */
export function modelAvailability(
  model: DebateAiModel,
  ctx: { hasOwnKey: boolean; hasLocalEndpoint: boolean },
): { usable: boolean; reason?: string } {
  if (model.tier === 'free') return { usable: true };
  if (model.tier === 'byok') {
    if (ctx.hasOwnKey) return { usable: true };
    return { usable: false, reason: '설정에서 내 API 키를 등록하면 사용할 수 있습니다' };
  }
  if (!ctx.hasLocalEndpoint) {
    return { usable: false, reason: 'debateBridge 앱을 실행하거나 debateNetwork 엔드포인트를 설정해 주세요' };
  }
  return { usable: true };
}
