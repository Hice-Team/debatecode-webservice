// debateQ 프롬프트 면접 — 전체 통과 후 사용자가 입력한 프롬프트(명령)를 순서대로 되짚으며
// "왜 이렇게 구사했는지"를 묻고, 프롬프트 구사력과 설명 능력을 종합 평가한다.
// 클라이언트(패널)와 서버(라운드 라우트)가 같은 질문을 결정적으로 계산한다.
import type { ChatMessage } from './types';

export const DQ_MAX_ROUNDS = 4;

const COMMAND_PREFIX = /^\[명령\]\s*/;

// 세션 메시지에서 사용자가 입력한 프롬프트(명령)만 순서대로 추출
export function extractPromptHistory(messages: ChatMessage[]): string[] {
  return messages
    .filter((m) => m.role === 'user' && COMMAND_PREFIX.test(m.content))
    .map((m) => m.content.replace(COMMAND_PREFIX, ''));
}

// 총 라운드 수 — 프롬프트별 질문 + 마지막 종합 질문. 프롬프트가 없으면(직접 수정 폴백) 기존 4라운드 흐름
export function totalPromptRounds(prompts: string[]): number {
  if (prompts.length === 0) return DQ_MAX_ROUNDS;
  return Math.min(DQ_MAX_ROUNDS, prompts.length + 1);
}

export function promptQuestion(prompts: string[], round: number): string {
  const total = totalPromptRounds(prompts);
  if (prompts.length > 0 && round < total) {
    return [
      `당신이 입력한 ${round}번째 프롬프트입니다.`,
      '',
      `"${prompts[round - 1]}"`,
      '',
      '왜 이 프롬프트를 이렇게 구사했나요? 의도한 동작과, 자료구조·시간 복잡도·예외 처리 관점에서 이렇게 지시한 이유를 설명해 주세요.',
    ].join('\n');
  }
  const extra = prompts.length > total - 1 ? ` 총 ${prompts.length}개의 프롬프트를 입력하셨는데,` : '';
  return `마지막 질문입니다.${extra} 전체 프롬프트 전략을 종합해 설명해 주세요 — 어떤 순서로 왜 그렇게 지시했고, 다시 한다면 어떤 프롬프트를 다르게 쓰시겠습니까?`;
}
