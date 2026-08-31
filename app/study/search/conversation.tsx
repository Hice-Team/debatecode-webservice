'use client';

// AI Search 대화 화면 — 질문 말풍선 + 답변 + 툴바, 하단 컴포저.
//
// 답변 영역에는 DeepSeek이 생성한 내용만 그린다. 서비스가 따로 검색한 '근거 문서' 목록은
// 모델이 실제로 참고한 것이 아니어서 출처를 오해하게 만들기 때문에 두지 않는다.
//
// 질의는 서버 액션이 아니라 `/api/ai-search/ask`(NDJSON 스트림)로 보낸다.
// 그래야 진행 단계(Stepper)를 타이머가 아니라 서버의 실제 진행 시점에 맞출 수 있고,
// 답변도 생성되는 대로 흘려 보여줄 수 있다.
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { setSessionModel } from '@/app/lib/actions/ai-search';
import { SEARCH_STEPS } from './steps';
import ResponseToolbar from './response-toolbar';
import Composer from './composer';
import AttachmentChips from './attachment-chips';
import AnswerMarkdown from './answer-markdown';
import { followUps, starters } from './prompt-starters';
import { takePendingAttachments, toWireAttachment, type PendingAttachment } from './pending-attachments';
import { findSearchModel, DEFAULT_SEARCH_MODEL_ID } from '@/app/lib/ai/search-models';
import { asEffort, type Effort } from '@/app/lib/ai/effort';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments: PendingAttachment[];
  /** 이 답변을 만든 모델 id — 투명성 고지에 쓴다 */
  model?: string | null;
  /** 이 답변에 든 토큰 — 응답 세부정보에서 보여준다 */
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** 공급자가 usage를 주지 않아 추정한 값인지 */
  tokensEstimated?: boolean;
  effort?: string | null;
  /** 이 답변에 내가 남긴 평가 — 새로고침해도 버튼 상태가 유지되도록 서버에서 함께 싣는다 */
  feedback?: { rating: 'up' | 'down'; reasons: string[]; comment?: string | null } | null;
}

type StepStatus = 'running' | 'done';
interface StepState {
  status: StepStatus;
  meta?: string;
}

/** `/api/ai-search/ask`가 흘려보내는 NDJSON 이벤트. */
type StreamEvent =
  | { type: 'step'; key: string; status: StepStatus; meta?: string }
  | { type: 'user-message'; id: string; createdAt: string }
  | { type: 'reasoning'; text: string }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      sessionId: string;
      live: boolean;
      message: ConversationMessage;
      /** 오늘 남은 대화 수 — 다 쓴 뒤에 알려 주면 늦다 */
      allowance?: { unlimited: true } | { unlimited: false; remaining: number; limit: number };
    }
  | { type: 'error'; message: string };

export default function Conversation({
  sessionId,
  initialMessages,
  initialQuestion,
  initialModel,
  initialEffort,
  importedFrom,
  branchedFrom,
  liveModel,
  userName,
}: {
  sessionId: string;
  initialMessages: ConversationMessage[];
  initialQuestion: string;
  initialModel: string;
  initialEffort: Effort;
  importedFrom: { fileName?: string; messageCount?: number } | null;
  branchedFrom: { sessionId?: string; title?: string | null } | null;
  liveModel: boolean;
  /** 인사말에 쓸 이름 — 없으면 이름 없이 인사한다(지어내지 않는다) */
  userName?: string | null;
}) {
  const { language } = useLanguage();
  const [messages, setMessages] = useState(initialMessages);
  const [model, setModel] = useState(initialModel || DEFAULT_SEARCH_MODEL_ID);
  const [effort, setEffort] = useState<Effort>(asEffort(initialEffort));
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [draft, setDraft] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 오늘 남은 대화 수. null이면 아직 모르거나 한도가 걸리지 않는 계정이다. */
  const [remaining, setRemaining] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  // 낙관적 말풍선의 내용 — 스트림 핸들러에서 읽어야 해서 state와 별도로 ref에도 담아 둔다
  const pendingQuestionRef = useRef<{ text: string; attachments: PendingAttachment[] } | null>(null);
  // 생성 중단 — 진행 중인 요청을 끊는다. 지금까지 받은 본문은 화면에 남긴다.
  const abortRef = useRef<AbortController | null>(null);
  const [stopped, setStopped] = useState(false);

  // 세션이 바뀌면 page.tsx가 key로 이 컴포넌트를 새로 마운트한다.
  // 덕분에 initialMessages/initialModel을 effect로 다시 밀어 넣을 필요가 없다
  // (밀어 넣으면 모델 저장 후 revalidate 때 스트리밍 중 상태까지 되감긴다).

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pendingQuestion]);

  /** 모델·강도 변경 — 화면에 즉시 반영하고 세션에도 저장한다 */
  function persistChoice(nextModel: string, nextEffort: Effort) {
    startTransition(async () => {
      const form = new FormData();
      form.set('sessionId', sessionId);
      form.set('model', nextModel);
      form.set('effort', nextEffort);
      await setSessionModel(form);
    });
  }

  function changeModel(next: string) {
    setModel(next);
    persistChoice(next, effort);
  }

  function changeEffort(next: Effort) {
    setEffort(next);
    persistChoice(model, next);
  }

  /**
   * 질의 스트림을 읽어 화면 상태로 옮긴다.
   * `regenerateOf`가 있으면 그 답변을 지우고 같은 질문으로 다시 만든다.
   */
  async function run(body: Record<string, unknown>, optimisticQuestion: string | null) {
    if (streaming) return;

    setError(null);
    setSteps({});
    setDraft('');
    setReasoning('');
    setReasoningOpen(false);
    setStopped(false);
    setPendingQuestion(optimisticQuestion);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai-search/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const failure = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(failure?.error ?? '답변을 받지 못했습니다.');
        // 재생성은 화면에서 기존 답변을 미리 지운 상태다. 요청이 거절되면
        // 서버에는 그 답변이 그대로 남아 있으므로 되읽어 화면을 복구한다.
        await resyncMessages();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // NDJSON — 줄 단위로 끊어 읽고, 마지막 조각은 다음 청크로 넘긴다
        let newline = buffer.indexOf('\n');
        while (newline !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf('\n');
          if (!line) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch (err) {
      // 중단은 실패가 아니다 — 사용자가 누른 결과이므로 오류로 알리지 않는다
      if ((err as Error)?.name !== 'AbortError') {
        setError('답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
        await resyncMessages();
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setPendingQuestion(null);
      setDraft('');
      setReasoning('');
      setSteps({});
    }
  }

  /** 서버에 저장된 대화를 다시 읽어 화면을 되맞춘다. */
  async function resyncMessages() {
    try {
      const res = await fetch(`/api/ai-search/session?id=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ConversationMessage[] };
      setMessages(data.messages);
    } catch {
      // 되읽기에 실패해도 화면은 그대로 두고, 다음 질문 때 자연히 맞춰진다
    }
  }

  /**
   * 생성 중단 — 요청을 끊는다.
   *
   * 서버는 사용자 질문을 이미 저장했고, 끊긴 시점까지 만들어진 답변도 저장한다.
   * 스트림을 끊으면 `done` 이벤트를 못 받으므로 저장된 상태를 다시 읽어 화면을 맞춘다.
   */
  function stopGenerating() {
    if (!abortRef.current) return;
    setStopped(true);
    abortRef.current.abort();
    // 서버가 부분 답변을 저장할 시간을 준 뒤 되읽는다.
    // 저장이 늦어질 수 있어 한 번 더 확인한다(같은 결과면 화면은 그대로다).
    setTimeout(() => void resyncMessages(), 400);
    setTimeout(() => void resyncMessages(), 1600);
  }

  function handleEvent(event: StreamEvent) {
    switch (event.type) {
      case 'step':
        setSteps((prev) => ({ ...prev, [event.key]: { status: event.status, meta: event.meta } }));
        return;

      case 'user-message': {
        // 서버가 실제로 저장한 질문 — 낙관적 말풍선을 진짜 메시지로 승격한다
        const question = pendingQuestionRef.current;
        if (question) {
          setMessages((prev) => [
            ...prev,
            {
              id: event.id,
              role: 'user',
              content: question.text,
              createdAt: event.createdAt,
              attachments: question.attachments,
            },
          ]);
        }
        setPendingQuestion(null);
        return;
      }

      case 'reasoning':
        setReasoning((prev) => prev + event.text);
        return;

      case 'delta':
        setDraft((prev) => prev + event.text);
        return;

      case 'done':
        setRemaining(event.allowance && !event.allowance.unlimited ? event.allowance.remaining : null);
        // 저장된 답변을 목록에 넣는 것과 흘려보내던 초안을 지우는 것을 **같은 배치**로 처리한다.
        // 나눠 두면 한 프레임 동안 초안과 최종 답변이 같이 떠서 화면이 한 번 튄다.
        setMessages((prev) => [...prev, event.message]);
        setDraft('');
        setReasoning('');
        setSteps({});
        return;

      case 'error':
        setError(event.message || '답변 생성에 실패했습니다.');
    }
  }

  function send(question: string, attachments: PendingAttachment[] = []) {
    const text = question.trim();
    if (!text || streaming) return;
    pendingQuestionRef.current = { text, attachments };
    void run(
      { sessionId, question: text, model, effort, attachments: attachments.map(toWireAttachment) },
      text,
    );
  }

  /** 답변 툴바의 새로고침 — 그 답변을 지우고 같은 질문으로 다시 만든다. */
  function regenerate(messageId: string) {
    if (streaming) return;
    pendingQuestionRef.current = null;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    void run({ sessionId, model, effort, regenerateOf: messageId }, null);
  }

  // 검색바에서 q로 들어온 첫 질문 — 한 번만 자동 전송한다
  useEffect(() => {
    if (autoSent.current || !initialQuestion) return;
    autoSent.current = true;
    // 히어로 검색바에서 고른 첨부가 있으면 첫 질문에 함께 보낸다
    send(initialQuestion, takePendingAttachments());
    // 주소창에 q가 남아 새로고침 때 다시 보내지 않도록 정리한다
    window.history.replaceState(null, '', `/study/search?session=${sessionId}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 최초 1회만 실행
  }, []);

  const empty = messages.length === 0 && !pendingQuestion && !streaming;
  const busy = streaming;
  /** 본문이 한 글자라도 나오기 시작했는가 — 사고 과정을 접는 기준 */
  const answering = draft.length > 0;

  return (
    // 대화 열 — 위는 스크롤되는 대화, 아래는 붙어 있는 입력창.
    // 열 자체가 화면 높이를 나눠 가지므로 안쪽에서 fixed를 쓸 일이 없다.
    //
    // 아직 아무 말도 오가지 않았으면 입력창이 맨 아래가 아니라 인사말 바로 아래,
    // 화면 가운데에 선다. 읽을 것이 없는 화면에서 입력창만 바닥에 붙어 있으면
    // 정작 시선이 가야 할 한가운데가 텅 빈다.
    <div className="flex min-h-0 flex-1 flex-col">
      {/* dc-scroll을 쓰지 않는다 — 그 스크롤바는 흰색이라 페이퍼 위에서 보이지 않는다 */}
      <main className="min-h-0 flex-1 overflow-y-auto">
      <div className={`px-4 sm:px-6 ${empty ? 'flex min-h-full flex-col justify-center py-10' : 'py-6 sm:py-8'}`}>
        {/* mx-auto — 대화도 입력창도 열 한가운데에 선다. 사이드바를 접고 펴면 열 폭이
            바뀌는데, 왼쪽에 붙여 두면 그때마다 글이 좌우로 끌려다닌다. */}
        <div className="mx-auto w-full min-w-0 max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            <Link
              href="/study"
              className="inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-signal"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2" aria-hidden>
                <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('ai-search-back', language)}
            </Link>
            {!liveModel && (
              <span className="ml-auto rounded-full border border-hairline bg-surface px-2.5 py-1 font-mono text-[10px] text-fg-muted">
                {t('ai-search-offline-badge', language)}
              </span>
            )}
          </div>

          {/* 분기된 대화 — 어디서 갈라져 나왔는지 한 줄로 밝히고 원본으로 돌아갈 길을 준다.
              이 표시가 없으면 목록에 비슷한 대화가 둘 생긴 이유를 알 수 없다. */}
          {branchedFrom?.sessionId && (
            <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-panel)] border border-hairline bg-surface px-4 py-3 text-[12px] text-fg-muted">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.6]" aria-hidden>
                <circle cx="6" cy="6" r="2.5" />
                <circle cx="6" cy="18" r="2.5" />
                <circle cx="18" cy="9" r="2.5" />
                <path d="M6 8.5v7M8.5 6.5h5a2 2 0 0 1 2 2v.5" strokeLinecap="round" />
              </svg>
              <span>{t('ai-branch-banner', language)}</span>
              {branchedFrom.title && (
                <span className="min-w-0 max-w-[18rem] truncate font-semibold text-fg">
                  {branchedFrom.title}
                </span>
              )}
              <Link
                href={`/study/search?session=${branchedFrom.sessionId}`}
                className="ml-auto shrink-0 font-semibold text-signal hover:underline"
              >
                {t('ai-branch-open-origin', language)}
              </Link>
            </div>
          )}

          {/* 가져온 세션 카드 — 최초 대화 지점에만 한 번 표시한다 */}
          {importedFrom?.fileName && (
            <div className="mb-6 rounded-[var(--radius-panel)] border border-hairline bg-surface px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-brand-600">Imported Session</p>
              <p className="mt-1 truncate font-semibold text-fg">{importedFrom.fileName}</p>
              <p className="mt-0.5 font-mono text-[11px] text-fg-quiet">
                {importedFrom.messageCount ?? messages.length} messages
              </p>
            </div>
          )}

          {/* 빈 대화 — 인사 한 줄과 입력창만. 무엇을 물어야 할지 정하는 자리라
              화면에 다른 것을 늘어놓지 않는다. */}
          {empty && (
            <div className="mb-4">
              <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-fg sm:text-[2rem]" style={{ wordBreak: 'keep-all' }}>
                {userName ? `${userName}님, 무엇이 궁금하신가요?` : '무엇이 궁금하신가요?'}
              </h1>
              <p className="mt-2 text-sm text-fg-muted">{t('ai-search-conversation-empty', language)}</p>
            </div>
          )}

          {/* 빈 대화에서는 입력창이 여기, 인사말 바로 아래에 선다 */}
          {empty && (
            <div className="mt-5">
              <Composer
                sessionId={sessionId}
                messages={messages}
                disabled={streaming}
                model={model}
                onModelChange={changeModel}
                effort={effort}
                onEffortChange={changeEffort}
                liveModel={liveModel}
                onSend={send}
                onStop={stopGenerating}
                centered
              />

              {/* 예시 질문 — "무엇이든 물어보세요"만 두면 오히려 막막하다.
                  누르면 그대로 보내진다. */}
              <ul className="mt-4 flex flex-wrap gap-2">
                {starters(language).map((starter) => (
                  <li key={starter.label}>
                    <button
                      type="button"
                      onClick={() => send(starter.prompt)}
                      disabled={streaming}
                      className="rounded-full border border-hairline bg-surface px-3.5 py-2 text-[13px] text-fg-secondary transition-colors hover:border-signal/40 hover:text-signal disabled:opacity-40"
                    >
                      {starter.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-8">
            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[92%] sm:max-w-[85%]">
                    <p className="whitespace-pre-wrap break-words rounded-[var(--radius-panel)] bg-brand-50 px-4 py-3 text-[15px] font-medium text-fg sm:px-5">{message.content}</p>
                    <AttachmentChips files={message.attachments} align="end" className="mt-2" />
                  </div>
                </div>
              ) : (
                <article key={message.id}>
                  <AnswerMarkdown>{message.content}</AnswerMarkdown>

                  {/* 어느 모델이 답했는지 + 검증하라는 고지. 답변마다 붙는다 —
                      한 대화 안에서도 모델을 바꿀 수 있으므로 화면 위 한 곳에만 적으면 어긋난다. */}
                  <p className="mt-4 font-mono text-[10px] text-fg-quiet">
                    {message.model && `${findSearchModel(message.model).label} · ${findSearchModel(message.model).vendor} · `}
                    {t('ai-answer-caution', language)}
                  </p>

                  <ResponseToolbar
                    message={message}
                    messages={messages}
                    onRegenerate={() => regenerate(message.id)}
                    busy={busy}
                  />
                </article>
              ),
            )}

            {/* 전송 중 — 낙관적 말풍선 → 진행 단계 → 흘러나오는 답변 */}
            {pendingQuestion && (
              <div className="flex justify-end">
                <p className="max-w-[92%] rounded-[var(--radius-panel)] bg-brand-50 px-4 py-3 sm:max-w-[85%] sm:px-5 text-[15px] font-medium text-fg">
                  {pendingQuestion}
                </p>
              </div>
            )}

            {streaming && (
              <div>
                {/* 사고 과정 → 답변.
                    답변이 흘러나오기 시작하면 진행 단계는 더 볼 이유가 없다. 그렇다고 그냥
                    지우면 화면이 훅 줄어들며 읽던 위치가 어긋나므로, 높이를 0fr로 접으면서
                    한 줄 요약으로 바꿔 준다. */}
                <div
                  aria-hidden={answering}
                  className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-500 ease-out motion-reduce:transition-none ${
                    answering ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
                  }`}
                >
                  <div className="min-h-0">
                    <ProcessingStepper steps={steps} />
                  </div>
                </div>

                {answering && (
                  <p className="flex items-center gap-1.5 text-[11px] text-fg-quiet animate-in fade-in duration-300">
                    <span aria-hidden className="text-emerald-600">✓</span>
                    {t('ai-thinking-done', language)}
                  </p>
                )}

                {reasoning && (
                  <details
                    open={reasoningOpen}
                    onToggle={(e) => setReasoningOpen((e.currentTarget as HTMLDetailsElement).open)}
                    className="mt-4 rounded-[var(--radius-panel)] border border-hairline bg-surface/70 px-4 py-3"
                  >
                    <summary className="cursor-pointer select-none text-[11px] font-semibold text-fg-muted">
                      {t('ai-reasoning-trace', language)} · {reasoning.length.toLocaleString()}자
                    </summary>
                    <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-fg-muted">
                      {reasoning}
                    </p>
                  </details>
                )}

                {draft && (
                  <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <AnswerMarkdown>{draft}</AnswerMarkdown>
                    <span
                      aria-hidden
                      className="-mt-4 ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-signal align-text-bottom motion-reduce:animate-none"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 이어서 묻기 — 마지막 답변 뒤에만. 모델이 골라 준 추천이 아니라 정해진
              후속 동작이므로, AI가 제안한 것처럼 보이지 않도록 이름을 붙여 둔다. */}
          {!streaming && !empty && messages[messages.length - 1]?.role === 'assistant' && (
            <div className="mt-8">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-fg-quiet">
                {t('ai-follow-up', language)}
              </p>
              <ul className="flex flex-wrap gap-2">
                {followUps(language).map((item) => (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => send(item.prompt)}
                      className="rounded-full border border-hairline bg-surface px-3.5 py-2 text-[13px] text-fg-secondary transition-colors hover:border-signal/40 hover:text-signal"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          {/* 남은 횟수 — 세 번 이하일 때만 말한다.
              매번 띄우면 잔소리가 되고, 다 쓴 뒤에 알리면 늦다. */}
          {remaining !== null && remaining <= 3 && !error && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {remaining > 0
                ? `오늘 ${remaining}번 더 물어볼 수 있습니다.`
                : '오늘 쓸 수 있는 대화 횟수를 모두 썼습니다.'}{' '}
              <Link href="/settings?tab=ai" className="font-semibold underline">
                내 API 키를 등록
              </Link>
              하면 제한이 없습니다.
            </p>
          )}

          {stopped && !streaming && (
            <p role="status" className="mt-6 rounded-xl bg-paper px-4 py-3 text-sm text-fg-secondary">
              {t('ai-stopped', language)}
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
      </main>

      {/* 입력창은 스크롤 칸 **밖**, 열의 마지막 칸이다 — 대화가 길어져도 늘 같은 자리에 있다.
          빈 대화에서는 위(인사말 아래)에 이미 서 있으므로 여기서는 그리지 않는다. */}
      {!empty && (
        <Composer
          sessionId={sessionId}
          messages={messages}
          disabled={streaming}
          model={model}
          onModelChange={changeModel}
          effort={effort}
          onEffortChange={changeEffort}
          liveModel={liveModel}
          onSend={send}
          onStop={stopGenerating}
        />
      )}
    </div>
  );
}

/**
 * 진행 단계 — 서버가 흘려보낸 step 이벤트만 반영한다.
 * 아직 소식이 없는 단계는 흐리게 두고, 건너뛸 수 있는 단계(추론)는 시작 전엔 아예 감춘다.
 */
function ProcessingStepper({ steps }: { steps: Record<string, StepState> }) {
  const visible = SEARCH_STEPS.filter((step) => !step.optional || steps[step.key]);

  return (
    <ol className="space-y-2" aria-live="polite">
      {visible.map((step, i) => {
        const state = steps[step.key];
        const status = state?.status === 'done' ? 'done' : state?.status === 'running' ? 'running' : 'idle';
        return (
          <li key={step.key} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold transition-colors ${
                status === 'done'
                  ? 'bg-emerald-100 text-emerald-700'
                  : status === 'running'
                    ? 'animate-pulse bg-signal text-white motion-reduce:animate-none'
                    : 'bg-paper text-fg-quiet'
              }`}
            >
              {status === 'done' ? '✓' : i + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-xs font-semibold ${status === 'idle' ? 'text-fg-quiet' : 'text-fg'}`}>
                {step.label}
                {state?.meta && <span className="ml-1.5 font-mono text-[10px] font-normal text-fg-quiet">{state.meta}</span>}
              </span>
              <span className={`block text-[11px] ${status === 'idle' ? 'text-fg-quiet' : 'text-fg-muted'}`}>
                {step.detail}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
