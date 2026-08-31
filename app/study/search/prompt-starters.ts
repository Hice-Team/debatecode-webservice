// 무엇을 물어야 할지 정하는 것을 돕는 두 목록.
//
// 빈 화면에 입력창만 두면 "무엇이든 물어보세요"라는 말이 오히려 막막하다. 실제로 무엇을
// 물을 수 있는지 예를 보여 주면 첫 질문의 문턱이 내려간다.
//
// 답변 뒤의 목록은 모델이 만들어 준 추천이 아니라 **정해진 후속 동작**이다. 그래서
// "이어서 묻기"라고 이름을 붙여 둔다 — AI가 골라 준 것처럼 보이게 하면 안 된다.
import type { Language } from '@/app/lib/types';

export interface Starter {
  /** 칩에 적히는 짧은 말 */
  label: string;
  /** 실제로 보낼 질문 — 칩 문구보다 구체적이다 */
  prompt: string;
}

const STARTERS_KO: Starter[] = [
  {
    label: '이분 탐색은 언제 쓰나요?',
    prompt: '이분 탐색을 언제 써야 하는지, 어떤 조건이 갖춰져야 쓸 수 있는지 예시와 함께 설명해 주세요.',
  },
  {
    label: 'DP와 그리디 구분하기',
    prompt: '동적 계획법과 그리디 알고리즘을 어떤 기준으로 구분하나요? 헷갈리기 쉬운 예를 들어 설명해 주세요.',
  },
  {
    label: '재귀를 반복문으로',
    prompt: '재귀 함수를 반복문으로 바꾸는 일반적인 방법을 단계별로 알려 주세요.',
  },
  {
    label: '시간복잡도 줄이기',
    prompt: 'O(n²) 풀이를 O(n log n)이나 O(n)으로 줄일 때 자주 쓰이는 접근법을 정리해 주세요.',
  },
];

const STARTERS_EN: Starter[] = [
  {
    label: 'When to use binary search',
    prompt: 'Explain when binary search applies and what conditions the data must satisfy, with examples.',
  },
  {
    label: 'DP vs. greedy',
    prompt: 'How do I tell dynamic programming and greedy apart? Walk through an example that is easy to confuse.',
  },
  {
    label: 'Recursion to iteration',
    prompt: 'Show me the general steps for converting a recursive function into an iterative one.',
  },
  {
    label: 'Cutting time complexity',
    prompt: 'What approaches most often bring an O(n^2) solution down to O(n log n) or O(n)?',
  },
];

/** 빈 화면의 예시 질문. */
export function starters(language: Language | string): Starter[] {
  return language === 'en' ? STARTERS_EN : STARTERS_KO;
}

const FOLLOW_UPS_KO: Starter[] = [
  { label: '더 자세히', prompt: '방금 답변을 더 자세히, 단계별로 풀어서 설명해 주세요.' },
  { label: '예시 코드', prompt: '방금 설명한 내용을 짧은 예시 코드로 보여 주세요.' },
  { label: '복잡도 분석', prompt: '방금 설명한 방법의 시간복잡도와 공간복잡도를 분석해 주세요.' },
  { label: '흔한 실수', prompt: '이 주제에서 초보자가 자주 하는 실수와 그 이유를 알려 주세요.' },
];

const FOLLOW_UPS_EN: Starter[] = [
  { label: 'Go deeper', prompt: 'Explain your last answer in more detail, step by step.' },
  { label: 'Show code', prompt: 'Show a short code example for what you just explained.' },
  { label: 'Complexity', prompt: 'Analyze the time and space complexity of the approach you described.' },
  { label: 'Common mistakes', prompt: 'What mistakes do beginners most often make with this, and why?' },
];

/**
 * 답변 뒤에 붙는 후속 질문 — 정해진 목록이다.
 * 모델이 고른 추천이 아니므로 "AI가 제안했다"고 읽히지 않게 라벨을 붙여 쓴다.
 */
export function followUps(language: Language | string): Starter[] {
  return language === 'en' ? FOLLOW_UPS_EN : FOLLOW_UPS_KO;
}
