// AI Search에서 고를 수 있는 모델 목록.
//
// 전부 Hugging Face Inference Router(OpenAI 호환 /v1/chat/completions)로 호출한다.
// 키 하나(HUGGINGFACE_API_KEY)로 카탈로그 전체를 쓸 수 있어 별도 연동이 필요 없다.
//
// Perplexity처럼 서비스가 요금을 부담해야 하는 모델은 두지 않는다 — 상용 API는 이용자가
// 자기 키를 등록해 debateAI 탭에서 쓴다(app/lib/ai/config.ts).
// 서버·클라이언트가 함께 import 하므로 이 파일에는 DB·비밀값을 두지 않는다.

export interface SearchModel {
  id: string;
  /** UI 표기 이름 */
  label: string;
  /** 제공자 표기 */
  vendor: string;
  /** 한 줄 특징 — 드롭다운에서 고르는 근거가 된다 */
  hint: string;
  /** Hugging Face 저장소 경로 */
  repo: string;
  /** 답변 앞에 사고 과정(<think> 또는 reasoning_content)을 흘리는 모델인지 — 진행 단계 표시에 쓴다 */
  reasoning: boolean;
}

export const SEARCH_MODELS: SearchModel[] = [
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    vendor: 'DeepSeek',
    // NOTE: V4는 아직 공개 배포본이 없어 현재 최신 플래그십(V3.1)에 매핑해 둔다.
    //       공개되면 repo만 바꾸면 되고 세션에 저장된 모델 id는 그대로 쓸 수 있다.
    hint: '범용 · 빠른 응답 — 추론과 긴 문맥에 강합니다',
    repo: 'deepseek-ai/DeepSeek-V3.1',
    reasoning: true,
  },
  {
    id: 'deepseek-coder-v2',
    label: 'DeepSeek Coder-V2',
    vendor: 'DeepSeek',
    hint: '코드 특화 — 구현·디버깅 질문에 강합니다',
    repo: 'deepseek-ai/DeepSeek-Coder-V2-Instruct',
    reasoning: false,
  },
];

export const DEFAULT_SEARCH_MODEL_ID = SEARCH_MODELS[0].id;

export function isSearchModelId(value: unknown): value is string {
  return typeof value === 'string' && SEARCH_MODELS.some((m) => m.id === value);
}

export function findSearchModel(id: string | null | undefined): SearchModel {
  return SEARCH_MODELS.find((m) => m.id === id) ?? SEARCH_MODELS[0];
}
