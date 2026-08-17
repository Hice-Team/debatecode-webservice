// 면접 설정 — 면접장에 들어가기 전에 고르는 값들.
//
// 같은 코드라도 "무엇을 파고들 것인가"에 따라 완전히 다른 면접이 된다.
// 그 축을 이용자가 직접 정하게 두되, 고르지 않아도 되도록 전부 기본값이 있다.
// 서버·클라이언트가 함께 import 하므로 비밀값은 두지 않는다.

/** 면접 경향 — 면접관이 어디를 물고 늘어질지 */
export type InterviewFocus = 'balanced' | 'technical' | 'code' | 'design' | 'communication';

/** 난이도 — 시작 코드 난이도(ScaffoldLevel)와 같은 이름·같은 세 칸을 쓴다 */
export type InterviewLevel = 'easy' | 'normal' | 'hard';

export interface InterviewConfig {
  /** 질문 수 (라운드) */
  rounds: number;
  level: InterviewLevel;
  focus: InterviewFocus;
}

export const ROUND_CHOICES = [2, 3, 4, 5, 6] as const;
export const MIN_ROUNDS = 2;
export const MAX_ROUNDS = 6;

export const DEFAULT_INTERVIEW_CONFIG: InterviewConfig = {
  rounds: 4,
  level: 'normal',
  focus: 'balanced',
};

export const FOCUS_LABELS: Record<InterviewFocus, string> = {
  balanced: '균형',
  technical: '기술 중심',
  code: '코드 분석',
  design: '설계·확장성',
  communication: '설명력',
};

export const FOCUS_HINTS: Record<InterviewFocus, string> = {
  balanced: '복잡도·자료구조·엣지 케이스를 고르게 묻습니다',
  technical: '시간·공간 복잡도와 알고리즘 선택을 깊게 파고듭니다',
  code: '작성한 코드의 구체적인 줄과 분기를 짚어 가며 묻습니다',
  design: '입력이 커지거나 요구가 바뀌면 어떻게 할지를 묻습니다',
  communication: '같은 내용을 얼마나 명확히 설명하는지를 봅니다',
};

export const LEVEL_LABELS: Record<InterviewLevel, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

export const LEVEL_HINTS: Record<InterviewLevel, string> = {
  easy: '개념 확인 위주 — 막히면 힌트를 줍니다',
  normal: '실제 기술 면접 수준으로 되묻습니다',
  hard: '반례를 들이대며 압박합니다 — 근거가 약하면 파고듭니다',
};

/** 어떤 값이 와도 쓸 수 있는 설정으로 만든다 — 저장된 값이 낡았거나 없을 수 있다. */
export function normalizeInterviewConfig(raw: unknown): InterviewConfig {
  const value = (raw ?? {}) as Partial<InterviewConfig>;
  const rounds = Number(value.rounds);
  return {
    rounds: Number.isFinite(rounds) ? Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(rounds))) : DEFAULT_INTERVIEW_CONFIG.rounds,
    level: value.level === 'easy' || value.level === 'hard' ? value.level : 'normal',
    focus:
      value.focus && value.focus in FOCUS_LABELS ? (value.focus as InterviewFocus) : DEFAULT_INTERVIEW_CONFIG.focus,
  };
}

/** 라운드별 초점 — 경향이 정해지면 라운드 순서도 그에 맞게 달라진다. */
export function roundFocusText(config: InterviewConfig, round: number): string {
  const tracks: Record<InterviewFocus, string[]> = {
    balanced: [
      '시간/공간 복잡도',
      '자료구조 선택의 트레이드오프',
      '엣지 케이스와 예외 처리',
      '리팩터링과 개선 방향',
    ],
    technical: [
      '시간 복잡도의 정확한 근거',
      '공간 복잡도와 메모리 사용',
      '더 나은 알고리즘의 존재 여부',
      '최악의 입력에서의 동작',
    ],
    code: [
      '핵심 반복문이 하는 일',
      '조건 분기와 경계값 처리',
      '변수·함수 이름과 구조의 의도',
      '이 코드에서 먼저 고칠 지점',
    ],
    design: [
      '입력 규모가 100배가 되면',
      '요구사항이 바뀌었을 때의 확장',
      '다른 모듈과 함께 쓸 때의 인터페이스',
      '테스트를 어떻게 설계할 것인가',
    ],
    communication: [
      '접근 방식을 비전공자에게 설명하기',
      '이 선택을 한 이유를 근거와 함께',
      '동료 리뷰어를 설득하는 논거',
      '스스로 아쉬운 점의 정리',
    ],
  };
  const track = tracks[config.focus];
  // 라운드 수가 트랙보다 길면 순환한다 — 같은 초점이라도 문맥이 쌓여 질문은 달라진다
  return track[(round - 1) % track.length];
}

/** 난이도가 면접관의 태도를 정한다 — 프롬프트에 그대로 붙는다. */
export function levelDirective(level: InterviewLevel): string {
  if (level === 'easy') {
    return '지원자가 막히면 방향을 짚어 주는 힌트를 한 문장 덧붙이세요. 몰아붙이지 마세요.';
  }
  if (level === 'hard') {
    return '반례나 구체적인 수치를 들이대며 압박하세요. 근거가 약한 부분은 물러서지 말고 다시 파고드세요.';
  }
  return '실제 기술 면접 수준으로, 근거를 요구하되 과하게 몰아붙이지는 마세요.';
}
