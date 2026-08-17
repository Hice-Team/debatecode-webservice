// 사고 강도(Effort) — AI Search와 debateAI가 함께 쓴다.
//
// 같은 모델이라도 "짧게 빨리"와 "길게 깊게"는 다른 도구다. 모델을 바꾸지 않고
// 그 축만 조절할 수 있게 분리했다. 서버·클라이언트가 함께 import 하므로 비밀값은 두지 않는다.
//
// 여섯 단계인 이유: 셋만 두면 "보통"이 너무 넓어 대부분이 거기 머문다.
// 짝수 단계로 두면 정중앙이 없어 매번 어느 쪽으로 기울일지 고르게 된다.
//
// 어떻게 적용되는가 — 두 가지뿐이다.
//   1. 출력 토큰 상한(max_tokens)
//   2. 시스템 프롬프트에 붙는 한 줄 지시
// `reasoning_effort` 같은 공급자 전용 파라미터는 보내지 않는다. Hugging Face 라우터는
// 여러 공급자로 요청을 넘기는데, 모르는 필드를 받으면 400으로 떨구는 공급자가 있다.
// 어떤 모델에서도 같게 동작하는 두 축만 쓴다.

export type Effort = 'minimal' | 'low' | 'medium' | 'high' | 'higher' | 'max';

/** 낮은 것부터 — 슬라이더의 눈금 순서가 그대로 이 순서다. */
export const EFFORTS: Effort[] = ['minimal', 'low', 'medium', 'high', 'higher', 'max'];

export const EFFORT_LABELS: Record<Effort, string> = {
  minimal: '최소',
  low: '낮음',
  medium: '보통',
  high: '높음',
  higher: '아주 높음',
  max: '최대',
};

/** 영문 표기 — 슬라이더 옆 괄호에 쓴다 */
export const EFFORT_LABELS_EN: Record<Effort, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  higher: 'Higher',
  max: 'Max',
};

export const EFFORT_HINTS: Record<Effort, string> = {
  minimal: '한두 문장 — 확인용 질문에',
  low: '핵심만 짧게 — 가장 빠릅니다',
  medium: '설명과 속도의 균형 (기본)',
  high: '근거까지 짚어 가며 설명합니다',
  higher: '대안과 트레이드오프까지 비교합니다',
  max: '놓치기 쉬운 경계 조건까지 — 느리고 토큰을 많이 씁니다',
};

export const DEFAULT_EFFORT: Effort = 'medium';

export function isEffort(value: unknown): value is Effort {
  return typeof value === 'string' && (EFFORTS as string[]).includes(value);
}

export function asEffort(value: unknown): Effort {
  return isEffort(value) ? value : DEFAULT_EFFORT;
}

/** 슬라이더 위치(0-5) ↔ 값 */
export function effortIndex(effort: Effort): number {
  const i = EFFORTS.indexOf(effort);
  return i === -1 ? EFFORTS.indexOf(DEFAULT_EFFORT) : i;
}

export function effortAt(index: number): Effort {
  return EFFORTS[Math.max(0, Math.min(EFFORTS.length - 1, Math.round(index)))];
}

/** 출력 토큰 상한 — 강도의 실질적인 차이는 대부분 여기서 난다. */
export function effortMaxTokens(effort: Effort): number {
  const budget: Record<Effort, number> = {
    minimal: 400,
    low: 800,
    medium: 1600,
    high: 2600,
    higher: 4000,
    max: 6000,
  };
  return budget[effort];
}

/** 시스템 프롬프트 뒤에 붙일 한 줄 — 길이만이 아니라 답의 결을 정한다. */
export function effortDirective(effort: Effort): string {
  const directive: Record<Effort, string> = {
    minimal: '한두 문장으로만 답하세요. 예시도 부연도 넣지 마세요.',
    low: '결론과 핵심 근거만 짧게 답하세요. 대안 비교와 긴 예시는 넣지 마세요.',
    medium: '이해에 필요한 만큼 설명하되 장황해지지 않게 하세요.',
    high: '왜 그런지 근거를 단계적으로 밝히며 설명하세요.',
    higher: '근거를 단계적으로 밝히고, 가능한 대안과 트레이드오프를 함께 비교해 주세요.',
    max: '근거를 단계적으로 밝히고, 대안과 트레이드오프, 놓치기 쉬운 경계 조건과 실패 사례까지 짚어 주세요.',
  };
  return `\n\n[응답 강도: ${EFFORT_LABELS[effort]}] ${directive[effort]}`;
}
