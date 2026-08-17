// debateAI 모델 id → 실제 호출 대상 매핑. **서버 전용** (키를 읽는다).
//
// 티어마다 키의 출처가 다르다.
//   free   서비스 키(HUGGINGFACE_API_KEY)로 Hugging Face Inference Router를 통해 호출
//   byok   이용자가 설정에 등록한 키(User.aiApiKey)로 각 사업자 API를 직접 호출
//   pro    디베이트메이트 혜택 — 서비스가 보유한 상용 키로 같은 모델을 호출
//   local  이용자의 debateBridge / debateNetwork 엔드포인트(OpenAI 호환)로 호출
//
// 모두 OpenAI 호환 chat/completions로 통일한다. Anthropic·Gemini만 네이티브 스펙이라
// llm-interviewer의 LlmConfig를 그대로 재사용해 한 곳에서 처리한다.
import type { LlmConfig } from './llm-interviewer';
import { findDebateAiModel, type DebateAiModelId } from './debateai-models';

/**
 * Free Tier에서 무슨 일이 있어도 부를 수 있는 모델.
 *
 * 라우터는 저장소마다 서빙 여부가 다르고, 어제 되던 모델이 오늘 내려가 있기도 하다.
 * 고른 모델이 404/503으로 막히면 화면에 오류를 띄우는 대신 이 모델로 한 번 더 시도한다
 * (그 사실은 응답 세부정보에 남는다 — 다른 모델의 답을 고른 모델의 답으로 읽게 두지 않는다).
 */
export const FREE_FALLBACK_REPO = 'deepseek-ai/DeepSeek-V3.1';

/** Free Tier — Hugging Face Router에서 부를 모델 경로. */
const FREE_REPOS: Record<string, string> = {
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

/** BYOK/Pro — 사업자별 호출 규격과 서비스 보유 키(Pro Tier용) 환경변수. */
const COMMERCIAL: Record<
  string,
  { kind: LlmConfig['kind']; provider?: string; baseUrl?: string; model: string; proKeyEnv: string }
> = {
  chatgpt: { kind: 'openai-compatible', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.1', proKeyEnv: 'OPENAI_API_KEY' },
  gemini: { kind: 'gemini', model: 'gemini-2.5-flash', proKeyEnv: 'GOOGLE_AI_API_KEY' },
  claude: { kind: 'anthropic', model: 'claude-sonnet-5', proKeyEnv: 'ANTHROPIC_API_KEY' },
  grok: { kind: 'openai-compatible', provider: 'grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.5', proKeyEnv: 'XAI_API_KEY' },
  perplexity: { kind: 'openai-compatible', provider: 'perplexity', baseUrl: 'https://api.perplexity.ai', model: 'sonar-pro', proKeyEnv: 'PERPLEXITY_API_KEY' },
};

export interface UserAiSettings {
  /** 설정에 등록한 개인 API 키 (복호화된 평문) */
  apiKey?: string | null;
  /** debateBridge / 로컬 LLM 엔드포인트 (OpenAI 호환) */
  baseUrl?: string | null;
  /** 디베이트메이트 — Pro Tier 혜택 대상 */
  isMate: boolean;
}

export type ResolveResult =
  | {
      config: LlmConfig;
      /** 이 호출이 실패하면 대신 시도할 모델 — Free Tier에만 있다 */
      fallbackModel?: string;
    }
  | { error: string; status: number };

/**
 * 모델 id와 이용자 설정으로 실제 호출 설정을 만든다.
 * 쓸 수 없는 조합이면 화면에 그대로 띄울 이유를 돌려준다.
 */
export function resolveDebateAiUpstream(modelId: DebateAiModelId, user: UserAiSettings): ResolveResult {
  const model = findDebateAiModel(modelId);

  /* ---------- Free Tier ---------- */
  if (model.tier === 'free') {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      return { error: '기본 제공 모델을 호출할 서버 키가 설정되지 않았습니다.', status: 503 };
    }
    const repo = FREE_REPOS[model.id] ?? FREE_FALLBACK_REPO;
    return {
      config: {
        kind: 'openai-compatible',
        provider: 'huggingface',
        baseUrl: 'https://router.huggingface.co/v1',
        apiKey,
        model: repo,
      },
      fallbackModel: repo === FREE_FALLBACK_REPO ? undefined : FREE_FALLBACK_REPO,
    };
  }

  /* ---------- Local ---------- */
  if (model.tier === 'local') {
    const baseUrl = user.baseUrl?.trim();
    if (!baseUrl) {
      return {
        error: 'debateBridge 앱을 실행하거나 설정에서 debateNetwork 엔드포인트를 등록해 주세요.',
        status: 400,
      };
    }
    return {
      config: { kind: 'openai-compatible', provider: 'bridge', baseUrl, apiKey: null, model: 'llama3.1' },
    };
  }

  /* ---------- BYOK / Pro ---------- */
  const spec = COMMERCIAL[model.id];
  if (!spec) return { error: '지원하지 않는 모델입니다.', status: 400 };

  // 개인 키가 먼저다. 없으면 디베이트메이트에 한해 서비스 키로 열어 준다.
  const ownKey = user.apiKey?.trim();
  const proKey = user.isMate ? process.env[spec.proKeyEnv] : undefined;
  const apiKey = ownKey || proKey;
  if (!apiKey) {
    return {
      error: `${model.label}은(는) 설정에서 내 API 키를 등록해야 사용할 수 있습니다. (디베이트메이트는 키 없이 사용 가능)`,
      status: 403,
    };
  }

  if (spec.kind === 'anthropic') return { config: { kind: 'anthropic', apiKey, model: spec.model } };
  if (spec.kind === 'gemini') return { config: { kind: 'gemini', apiKey, model: spec.model } };
  return {
    config: {
      kind: 'openai-compatible',
      provider: spec.provider ?? model.id,
      baseUrl: spec.baseUrl ?? '',
      apiKey,
      model: spec.model,
    },
  };
}
