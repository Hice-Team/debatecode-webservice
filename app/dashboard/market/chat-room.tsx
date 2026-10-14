'use client';

// 거래 대화방 — 매물 하나에 대한 판매자↔구매자 1:1 대화.
//
// 일반 채팅 앱과 다른 점 두 가지를 화면에 드러낸다.
//   1) 거래 상태가 대화 안에 시스템 메시지로 섞여 흐른다. "예약중으로 바뀌었습니다"가
//      말풍선 사이에 남아야 나중에 언제 합의했는지 알 수 있다.
//   2) 내 메시지는 수정·삭제할 수 있고, 삭제해도 자리는 남는다. 대화에 구멍이 나면
//      상대는 무슨 말이 오갔는지 알 수 없고 분쟁 시 근거도 사라진다.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteMessage, editMessage, hideChat, sendMessage } from '@/app/lib/actions/market';
import { LISTING_STATUS_META, type ListingStatus } from '@/app/lib/market';

export interface ChatMessage {
  id: string;
  senderId: string;
  content: string;
  systemKind: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export default function ChatRoom({
  chatId,
  meId,
  counterpartName,
  messages,
}: {
  chatId: string;
  meId: string;
  counterpartName: string;
  messages: ChatMessage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 들어오면 맨 아래로 — 읽던 위치가 아니라 최신이 기준이다
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function run(action: () => Promise<{ ok?: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function send() {
    const content = draft.trim();
    if (!content) return;
    const form = new FormData();
    form.set('chatId', chatId);
    form.set('content', content);
    run(() => sendMessage(form), () => setDraft(''));
  }

  function saveEdit() {
    if (!editing || !editing.content.trim()) return;
    const form = new FormData();
    form.set('messageId', editing.id);
    form.set('content', editing.content);
    run(() => editMessage(form), () => setEditing(null));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 머리글 */}
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{counterpartName}</p>
        <button
          type="button"
          onClick={() => {
            if (!confirm('이 대화를 내 목록에서 숨깁니다.\n상대의 기록은 그대로 남고, 새 메시지가 오면 다시 나타납니다.')) return;
            const form = new FormData();
            form.set('chatId', chatId);
            run(() => hideChat(form), () => router.push('/dashboard/market'));
          }}
          disabled={pending}
          className="shrink-0 rounded-full border border-hairline px-3 py-1.5 text-[12px] font-medium text-fg-secondary transition-colors hover:border-ink/25 disabled:opacity-40"
        >
          대화 숨기기
        </button>
      </header>

      {/* 메시지 */}
      <div className="dc-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="py-12 text-center text-sm text-fg-muted">
            아직 주고받은 메시지가 없습니다. 먼저 인사를 건네 보세요.
          </p>
        )}

        {messages.map((message) => {
          // 거래 상태 알림 — 말풍선이 아니라 가운데 한 줄로
          if (message.systemKind) {
            const meta = LISTING_STATUS_META[message.systemKind as ListingStatus];
            return (
              <p key={message.id} className="text-center text-[12px] text-fg-muted">
                <span className="rounded-full bg-paper px-3 py-1">
                  {meta ? `거래 상태가 '${meta.label}'으로 바뀌었습니다.` : message.content}
                </span>
              </p>
            );
          }

          const mine = message.senderId === meId;
          const isEditing = editing?.id === message.id;

          return (
            <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] min-w-0">
                {isEditing ? (
                  <div className="rounded-[var(--radius-panel)] border border-signal bg-surface p-2">
                    <textarea
                      value={editing.content}
                      onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                      rows={2}
                      className="w-full resize-none rounded-[var(--radius-card)] border border-hairline px-2.5 py-1.5 text-sm text-fg focus:border-signal focus:outline-none"
                    />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="rounded-full px-3 py-1 text-[12px] text-fg-muted hover:text-fg"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        disabled={pending}
                        className="rounded-full bg-signal px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-40"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className={`whitespace-pre-wrap break-words rounded-[var(--radius-panel)] px-3.5 py-2.5 text-sm leading-relaxed ${
                      message.deletedAt
                        ? 'border border-dashed border-hairline text-fg-quiet'
                        : mine
                          ? 'bg-signal text-white'
                          : 'border border-hairline bg-surface text-fg-secondary'
                    }`}
                  >
                    {message.deletedAt ? '삭제된 메시지입니다.' : message.content}
                  </p>
                )}

                <div className={`mt-1 flex items-center gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  <time className="dc-num text-[10px] text-fg-quiet" dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  {message.editedAt && !message.deletedAt && (
                    <span className="text-[10px] text-fg-quiet">수정됨</span>
                  )}
                  {mine && !message.deletedAt && !isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing({ id: message.id, content: message.content })}
                        className="text-[10px] text-fg-quiet transition-colors hover:text-signal"
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const form = new FormData();
                          form.set('messageId', message.id);
                          run(() => deleteMessage(form));
                        }}
                        className="text-[10px] text-fg-quiet transition-colors hover:text-rose-600"
                      >
                        삭제
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력 */}
      <div className="shrink-0 border-t border-hairline p-3">
        {error && (
          <p role="alert" className="mb-2 text-[12px] text-rose-600">
            {error}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter로 보내고 Shift+Enter로 줄바꿈 — 거래 대화는 짧은 문장이 대부분이다
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="메시지를 입력하세요"
            className="min-h-[42px] flex-1 resize-none rounded-[var(--radius-panel)] border border-hairline bg-surface px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-quiet focus:border-signal focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !draft.trim()}
            className="h-[42px] shrink-0 rounded-full bg-signal px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            보내기
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">
          거래 전 상대의 계좌·연락처를 더치트에서 조회해 보세요. 서비스는 개인 간 거래에 관여하지 않습니다.
        </p>
      </div>
    </div>
  );
}
