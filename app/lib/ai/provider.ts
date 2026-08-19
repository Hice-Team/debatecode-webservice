// DebateAI 면접관 프로바이더 인터페이스.
// 사용자별 설정(User.aiProvider/aiModel/aiApiKey/aiBaseUrl)에 따라 구현체를 선택한다.
// - mock: 휴리스틱 목업 (기본값, 키 불필요)
// - anthropic / gemini / openai / grok: 네이티브 API, 사용자 키 필요
// - groq / huggingface: OpenAI 호환 클라우드 API, 사용자 키 필요
// - local: 사용자가 직접 입력한 OpenAI 호환 엔드포인트 (Ollama, LM Studio 등)
// - bridge: debateBridge(Electron) 앱이 로컬에 띄우는 OpenAI 호환 엔드포인트
import type {
  ChatMessage,
  CodeAnalysis,
  DefenseReport,
  Language,
  ProblemMeta,
  RoundEval,
} from '@/app/lib/types';
import type { InterviewConfig } from './interview-config';
import { MockInterviewer } from './mock-interviewer';
import { LlmInterviewer } from './llm-interviewer';
import { DEFAULT_CODE_MODEL_ID } from './debateai-models';
import { resolveDebateAiUpstream } from './debateai-upstream';
import { DEFAULT_BASE_URLS } from './config';
import { getFreeAiLlmConfig } from './free-ai';

export interface QuestionContext {
  analysis: CodeAnalysis;
  problem: ProblemMeta;
  round: number; // 1-based, 이번에 던질 질문의 라운드
  history: ChatMessage[];
  seed: string; // submissionId — 재도전 시 질문 변화용
  codeChanged?: boolean; // 직전 답변에서 코드가 수정되었는지
  code?: string; // 현재 코드 (LLM 프로바이더용)
  /** 면접장 입장 전에 고른 설정 — 문항 수·난이도·경향 */
  config?: InterviewConfig;
}

export interface EvaluateContext {
  question: string;
  answer: string;
  analysis: CodeAnalysis;
  problem: ProblemMeta;
  round: number;
  code: string;
  config?: InterviewConfig;
}

export interface InterviewerProvider {
  analyze(code: string, language: Language, problem: ProblemMeta): CodeAnalysis;
  nextQuestion(ctx: QuestionContext): Promise<string>;
  evaluateAnswer(ctx: EvaluateContext): Promise<RoundEval>;
  finalReport(rounds: RoundEval[], analysis: CodeAnalysis, problem: ProblemMeta): Promise<DefenseReport>;
}

export interface UserAiConfig {
  aiProvider: string;
  aiModel: string | null;
  aiApiKey: string | null;
  aiBaseUrl: string | null;
  /** 설정 → 서비스에서 고른 면접·리팩토링 전용 모델 (debateai-models.ts의 id) */
  aiCodeModel?: string | null;
}

export { AI_PROVIDERS, DEFAULT_MODELS, DEFAULT_BASE_URLS } from './config';

const OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  grok: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  huggingface: 'https://router.huggingface.co/v1',
  perplexity: 'https://api.perplexity.ai',
};

export function getProviderFor(config?: UserAiConfig | null): InterviewerProvider {
  // "규칙 기반 모델"을 고른 이용자는 그 선택을 그대로 존중한다 — AI를 쓰지 않겠다는 뜻이다
  if (!config || config.aiProvider === 'mock') return new MockInterviewer();

  // 면접·리팩토링은 코드를 읽고 따지는 일이라 전용 모델을 따로 둔다.
  // 설정에서 고르지 않았으면 기본값(DeepSeek Coder-V2)을 쓴다.
  // 호출할 수 없는 조합(키 없음 등)이면 아래의 기존 경로로 자연스럽게 넘어간다.
  const codeModel = config.aiCodeModel || DEFAULT_CODE_MODEL_ID;
  const resolved = resolveDebateAiUpstream(codeModel, {
    apiKey: config.aiApiKey,
    baseUrl: config.aiBaseUrl,
  });
  if ('config' in resolved) return new LlmInterviewer(resolved.config);

  // Debate Free AI — 서버 키(HUGGINGFACE_API_KEY)로 도는 기본 제공 모델.
  // aiModel에는 이용자가 고른 Free AI 카탈로그의 모델 id가 저장된다.
  // 일일 토큰 쿠터는 각 API 라우트에서 검사한다 (소진 시 mock 전달).
  if (config.aiProvider === 'builtin_ai') {
    const freeConfig = getFreeAiLlmConfig(config.aiModel);
    return freeConfig ? new LlmInterviewer(freeConfig) : new MockInterviewer();
  }

  if (config.aiProvider === 'anthropic' && config.aiApiKey) {
    return new LlmInterviewer({ kind: 'anthropic', apiKey: config.aiApiKey, model: config.aiModel });
  }
  if (config.aiProvider === 'gemini' && config.aiApiKey) {
    return new LlmInterviewer({ kind: 'gemini', apiKey: config.aiApiKey, model: config.aiModel });
  }
  // OpenAI/Grok/Groq/HuggingFace: 전부 OpenAI 호환 chat/completions, 고정 baseUrl + 사용자 키
  if (config.aiProvider in OPENAI_COMPATIBLE_BASE_URLS && config.aiApiKey) {
    return new LlmInterviewer({
      kind: 'openai-compatible',
      provider: config.aiProvider,
      baseUrl: OPENAI_COMPATIBLE_BASE_URLS[config.aiProvider],
      apiKey: config.aiApiKey,
      model: config.aiModel,
    });
  }
  // local / bridge: 사용자 지정 OpenAI 호환 엔드포인트 (Ollama, LM Studio, debateBridge)
  // 키는 선택 — 로컬 서버는 보통 인증이 없다. baseUrl이 없으면 프로바이더별 기본값 사용.
  if (config.aiProvider === 'local' || config.aiProvider === 'bridge') {
    const baseUrl = config.aiBaseUrl || DEFAULT_BASE_URLS[config.aiProvider];
    if (baseUrl) {
      return new LlmInterviewer({
        kind: 'openai-compatible',
        provider: config.aiProvider,
        baseUrl,
        apiKey: config.aiApiKey,
        model: config.aiModel,
      });
    }
  }
  // 설정이 불완전한 경우는 목업으로 안전하게 폴백
  return new MockInterviewer();
}
