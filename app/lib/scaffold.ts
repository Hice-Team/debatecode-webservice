// 시그니처·디베이트 모드의 시작 코드 난이도 3단계.
//
// 세 단계를 가르는 축은 두 가지다 — "시작 코드가 얼마나 주어지는가"와 "debateAI를 쓸 수 있는가".
//   쉬움    상수 정의된 스타터 + debateAI 사용 가능 (물어보며 작성)
//   보통    상수 정의된 스타터 + debateAI 잠금 (혼자 작성)
//   어려움  빈 코드 + debateAI 잠금 (전부 직접)
// 즉 쉬움과 보통은 같은 코드에서 출발하고, AI를 쓸 수 있느냐로만 갈린다.
import type { Language, StarterCodes } from './types';

export type ScaffoldLevel = 'easy' | 'normal' | 'hard';

export const SCAFFOLD_LEVELS: ScaffoldLevel[] = ['easy', 'normal', 'hard'];

export const SCAFFOLD_LABELS: Record<ScaffoldLevel, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

export const SCAFFOLD_DESCRIPTIONS: Record<ScaffoldLevel, string> = {
  easy: '상수가 정의된 시작 코드 + debateAI에게 물어보며 작성합니다',
  normal: '상수가 정의된 시작 코드만 주어집니다 (debateAI 사용 불가)',
  hard: '빈 코드에서 전부 직접 작성합니다 (debateAI 사용 불가)',
};

/** 이 난이도에서 debateAI 챗봇을 쓸 수 있는가 — 탭·CTA·챗봇이 같은 기준을 본다. */
export function allowsAi(level: ScaffoldLevel): boolean {
  return level === 'easy';
}

export function hardScaffold(language: Language): string {
  return language === 'python'
    ? '# 어려움 모드 — 빈 코드에서 시작합니다. solution 함수를 직접 정의하세요.\n'
    : '// 어려움 모드 — 빈 코드에서 시작합니다. solution 함수를 직접 정의하세요.\n';
}

/**
 * 고른 난이도의 시작 코드 묶음 — 언어 전부에 한 번에 적용한다.
 *
 * 난이도는 입장 전에 한 번만 정해지므로, 풀이 중 언어를 바꿔도 같은 난이도의 코드가 나와야 한다.
 * (언어별로 따로 적용하면 어려움으로 시작한 뒤 언어를 바꿔 스타터를 받아 가는 구멍이 생긴다.)
 */
export function scaffoldCodes(level: ScaffoldLevel, starters: StarterCodes): StarterCodes {
  if (level !== 'hard') return starters;
  const next = { ...starters };
  for (const l of Object.keys(next) as Language[]) next[l] = hardScaffold(l);
  return next;
}

// 쉬움 모드 폴백 — AI 미연결 시 스타터 골격에 단계 가이드 주석을 붙인다
