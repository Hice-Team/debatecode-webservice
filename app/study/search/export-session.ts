// 대화 내보내기 — 두 가지 범위를 구분한다.
//
//   컴포저의 "대화 내보내기"  → 세션 전체
//   답변 툴바의 ".json 내보내기" → 그 답변(과 그 답변을 부른 질문) 하나
//
// 어느 쪽이든 토큰·내부 식별자는 담지 않는다. 다시 불러오기(importSessionFile)와 호환되도록
// format/version 헤더를 붙인다.
import type { ConversationMessage } from './conversation';

export const EXPORT_FORMAT = 'debatecode-ai-session';
export const EXPORT_VERSION = 1;

interface ExportedMessage {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  model?: string | null;
}

function download(payload: unknown, suffix: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `debatecode-ai-${suffix}-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function toExported(message: ConversationMessage): ExportedMessage {
  return {
    role: message.role,
    content: message.content,
    createdAt: message.createdAt,
    ...(message.model ? { model: message.model } : {}),
  };
}

/** 세션 전체를 내보낸다. */
export function exportConversation(messages: ConversationMessage[]) {
  download(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      scope: 'session',
      createdAt: new Date().toISOString(),
      messages: messages.map(toExported),
    },
    'session',
  );
}

/** 답변 하나만 내보낸다 — 무엇에 대한 답인지 알 수 있게 직전 질문을 함께 담는다. */
export function exportSingleAnswer(messages: ConversationMessage[], answerId: string) {
  const index = messages.findIndex((m) => m.id === answerId);
  if (index === -1) return;

  const answer = messages[index];
  const question = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user');

  download(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      scope: 'message',
      createdAt: new Date().toISOString(),
      messages: [...(question ? [toExported(question)] : []), toExported(answer)],
    },
    'answer',
  );
}
