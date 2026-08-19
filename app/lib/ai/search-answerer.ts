// AI Search의 "AI 계층" — 대화 맥락을 받아 답변 텍스트를 만든다.
//
// 계층 분리:
//   Conversation Layer  세션/메시지 저장·복원  → app/lib/actions/ai-search.ts, app/api/ai-search/ask
//   AI Layer            모델 호출 (이 파일)
// 답변은 모델이 생성한 것만 그대로 내보낸다. 서비스가 문서를 따로 검색해
// "근거"로 덧붙이지 않으므로, 화면에 보이는 내용은 전부 DeepSeek의 출력이다.
import { llmChatStream, type LlmChunk, type LlmConfig, type LlmUsage } from './llm-interviewer';
import { DEFAULT_EFFORT, effortDirective, effortMaxTokens, type Effort } from './effort';
import { getFreeAiLlmConfig } from './free-ai';
import { findSearchModel } from './search-models';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `당신은 debateCode의 개발 학습 도우미입니다.
개발자가 프로그래밍 언어·라이브러리·알고리즘에 대해 물으면 한국어로 직접, 충실하게 답합니다.

규칙:
- 질문에 곧바로, 아는 범위에서 충실히 답하세요.
- 코드 예시는 짧고 바로 실행 가능한 형태로 제시하세요.
- 확실하지 않은 부분은 단정하지 말고 확인이 필요하다고 밝히세요.
- 답변은 마크다운으로 작성하되 제목은 ## 이하만 사용하세요.
- 이전 대화 맥락을 이어받아 후속 질문에 답하세요.`;

/**
 * Hugging Face Inference Router 설정 — 키 하나로 카탈로그의 모든 모델을 호출한다.
 * env: HUGGINGFACE_API_KEY (필수)
 */
function getHuggingFaceConfig(modelId?: string | null): LlmConfig | null {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) return null;
  return {
    kind: 'openai-compatible',
    provider: 'huggingface',
    baseUrl: 'https://router.huggingface.co/v1',
    apiKey,
    model: findSearchModel(modelId).repo,
  };
}

/**
 * 사용할 모델 설정을 고른다.
 *
 * 1순위 Hugging Face(고른 모델) → 2순위 Free AI 기본 모델로 내려간다.
 * 둘 다 없으면 null이며, 호출부는 안내 문구를 답변 자리에 넣는다.
 */
export function getSearchLlmConfig(modelId?: string | null): LlmConfig | null {
  return getHuggingFaceConfig(modelId) ?? getFreeAiLlmConfig();
}

/** 추론형 모델 대응 — 넉넉히 잡는다. */
const SEARCH_TIMEOUT_MS = 90_000;

/** 사용자가 고른 모델이 실제로 호출 가능한지 — 드롭다운 비활성 표시에 쓴다. */
export function hasModelCatalogAccess(): boolean {
  return !!process.env.HUGGINGFACE_API_KEY;
}

/**
 * 모델을 쓸 수 없을 때 답변 자리에 넣는 안내.
 * 왜 AI가 답하지 못했는지(키 미설정 / 호출 실패)를 구분해 알려준다 — 빈 답변만 보이면
 * 이용자는 오작동으로 받아들이기 때문이다.
 */
export function fallbackAnswer(reason: 'no-key' | 'failed'): string {
  if (reason === 'failed') return '_AI 응답을 받지 못했습니다. 잠시 후 다시 시도하거나 다른 모델을 선택해 보세요._';
  return '_AI 응답 모델이 연결되어 있지 않습니다. 환경변수 `HUGGINGFACE_API_KEY`를 설정하면 DeepSeek이 직접 답변합니다._';
}

export interface AnswerInput {
  question: string;
  history: ChatTurn[];
  attachmentNames?: string[];
  modelId?: string | null;
  /** 사고 강도 — 출력 길이와 답의 결을 정한다 */
  effort?: Effort;
  /** 이용자가 생성을 중단하면 이 신호로 모델 호출까지 함께 끊는다 */
  signal?: AbortSignal;
  /** 공급자가 토큰 사용량을 알려 주면 그대로 넘겨준다 */
  onUsage?: (usage: LlmUsage) => void;
}

/** 모델에 넘길 사용자 프롬프트 — 단발 호출과 스트리밍이 같은 문자열을 쓴다. */
function buildPrompt(input: AnswerInput): string {
  // 대화 맥락은 최근 8턴만 넘긴다 — 토큰을 아끼면서 후속 질문 연결은 유지된다
  const recent = input.history.slice(-8);
  const transcript = recent.map((turn) => `${turn.role === 'user' ? '사용자' : '어시스턴트'}: ${turn.content}`).join('\n\n');

  const attachmentNote =
    input.attachmentNames && input.attachmentNames.length > 0
      ? `\n\n[첨부된 파일] ${input.attachmentNames.join(', ')}\n(파일 내용은 아직 모델에 전달되지 않습니다. 파일 이름만 참고하세요.)`
      : '';

  return [
    transcript ? `[이전 대화]\n${transcript}` : '',
    `[질문]\n${input.question}${attachmentNote}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 답변을 토큰 단위로 흘린다 — 진행 단계 표시를 실제 생성 과정에 맞추기 위한 경로.
 *
 * 사고 과정을 `reasoning_content`로 따로 주지 않고 본문에 `<think>`로 섞어 보내는
 * 공급자가 있어, 여기서 태그를 잘라 reasoning / content로 나눠 준다.
 * 호출부는 이 구분만 보고 "추론 중 → 답변 작성 중" 단계를 전환한다.
 */
export async function* streamSearchAnswer(input: AnswerInput): AsyncGenerator<LlmChunk> {
  const config = getSearchLlmConfig(input.modelId);
  if (!config) throw new Error('no-config');

  let inThink = false;
  let carry = ''; // 태그가 청크 경계에서 잘리는 경우를 대비한 꼬리 보관

  const effort = input.effort ?? DEFAULT_EFFORT;
  for await (const chunk of llmChatStream(config, SYSTEM_PROMPT + effortDirective(effort), buildPrompt(input), {
    timeoutMs: SEARCH_TIMEOUT_MS,
    maxTokens: effortMaxTokens(effort),
    signal: input.signal,
    onUsage: input.onUsage,
  })) {
    if (chunk.kind === 'reasoning') {
      yield chunk;
      continue;
    }

    let text = carry + chunk.text;
    carry = '';

    // `<think>` / `</think>`가 반쯤 걸쳐 들어온 경우 다음 청크까지 미룬다
    const tail = text.match(/<\/?t?h?i?n?k?>?$/);
    if (tail && tail[0] !== '<think>' && tail[0] !== '</think>') {
      carry = tail[0];
      text = text.slice(0, text.length - carry.length);
    }

    while (text) {
      if (inThink) {
        const end = text.indexOf('</think>');
        if (end === -1) {
          if (text) yield { kind: 'reasoning', text };
          text = '';
        } else {
          if (end > 0) yield { kind: 'reasoning', text: text.slice(0, end) };
          text = text.slice(end + '</think>'.length);
          inThink = false;
        }
      } else {
        const start = text.indexOf('<think>');
        if (start === -1) {
          if (text) yield { kind: 'content', text };
          text = '';
        } else {
          if (start > 0) yield { kind: 'content', text: text.slice(0, start) };
          text = text.slice(start + '<think>'.length);
          inThink = true;
        }
      }
    }
  }

  if (carry) yield { kind: inThink ? 'reasoning' : 'content', text: carry };
}
