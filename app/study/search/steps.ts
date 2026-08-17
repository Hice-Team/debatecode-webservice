/**
 * AI Search 진행 단계 — 대화 화면의 Stepper가 그리는 목록.
 *
 * 여기의 key는 `/api/ai-search/ask`가 실제로 그 지점을 지날 때 흘려보내는 이벤트 key와 같다.
 * 즉 화면의 단계 표시는 타이머가 아니라 서버의 실제 진행 상황을 그대로 따라간다.
 * `optional`은 모델이 사고 과정을 내보내지 않으면(예: Coder-V2) 건너뛰는 단계다.
 */
export const SEARCH_STEPS = [
  { key: 'receive', label: '질의 접수', detail: '세션 확인 · 대화 맥락 수집', optional: false },
  { key: 'dispatch', label: '모델 호출', detail: 'DeepSeek 추론 서버로 요청 전송', optional: false },
  { key: 'reason', label: '추론', detail: 'DeepSeek 사고 과정 진행 중', optional: true },
  { key: 'compose', label: '답변 생성', detail: '토큰 스트리밍으로 본문 작성', optional: false },
  { key: 'store', label: '대화 저장', detail: '세션에 질문과 답변 기록', optional: false },
] as const;

export type SearchStepKey = (typeof SEARCH_STEPS)[number]['key'];
