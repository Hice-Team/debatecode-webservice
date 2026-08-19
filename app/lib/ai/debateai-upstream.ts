// debateAI 모델 id → 실제 호출 대상 매핑. **서버 전용** (키를 읽는다).
//
// 티어마다 키의 출처가 다르다.
//   free   서비스 키(HUGGINGFACE_API_KEY)로 Hugging Face Inference Router를 통해 호출
//   byok   이용자가 설정에 등록한 키(User.aiApiKey)로 각 사업자 API를 직접 호출
//   local  이용자의 debateBridge / debateNetwork 엔드포인트(OpenAI 호환)로 호출
//
// 상용 API는 **전부 이용자 키**로만 부른다. 서비스가 OpenAI·Anthropic 요금을 대신 내지 않는다.
//
// 모두 OpenAI 호환 chat/completions로 통일한다. Anthropic·Gemini만 네이티브 스펙이라
// llm-interviewer의 LlmConfig를 그대로 재사용해 한 곳에서 처리한다.
import type { LlmConfig } from './llm-interviewer';
import { findDebateAiModel, type DebateAiModelId } from './debateai-models';
import { FREE_FALLBACK_REPO, freeAiRepo } from './free-ai-models';

export { FREE_FALLBACK_REPO } from './free-ai-models';

/** BYOK — 사업자별 호출 규격. 키는 언제나 이용자가 등록한 것을 쓴다. */
const COMMERCIAL: Record<
  string,
  { kind: LlmConfig['kind']; provider?: string; baseUrl?: string; model: string }
> = {
  chatgpt: { kind: 'openai-compatible', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.1' },
  gemini: { kind: 'gemini', model: 'gemini-2.5-flash' },
  claude: { kind: 'anthropic', model: 'claude-sonnet-5' },
  grok: { kind: 'openai-compatible', provider: 'grok', baseUrl: 'https://api.x.ai/v1', model: 'grok-4.5' },
  perplexity: { kind: 'openai-compatible', provider: 'perplexity', baseUrl: 'https://api.perplexity.ai', model: 'sonar-pro' },
};

export interface UserAiSettings {
  /** 설정에 등록한 개인 API 키 (복호화된 평문) */
  apiKey?: string | null;
  /** debateBridge / 로컬 LLM 엔드포인트 (OpenAI 호환) */
  baseUrl?: string | null;
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
    const repo = freeAiRepo(model.id);
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

  /* ---------- BYOK ---------- */
  const spec = COMMERCIAL[model.id];
  if (!spec) return { error: '지원하지 않는 모델입니다.', status: 400 };

  const apiKey = user.apiKey?.trim();
  if (!apiKey) {
    return {
      error: `${model.label}은(는) 설정에서 내 API 키를 등록해야 사용할 수 있습니다.`,
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
