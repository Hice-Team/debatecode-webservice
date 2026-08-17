'use client';

// debateAI 챗봇 탭 — 시그니처·디베이트·리팩토링 어디서든 같은 화면이다.
//
// 입력 영역이 이 화면의 중심이다 — 위에서부터
//   추천 프롬프트(가로 슬라이드, 접기/펴기) → 입력창 → [모델·강도] ····· [Ask|Agent] [음성] [전송]
// 모델 셀렉터는 상단 바가 아니라 입력바 안에 둔다. 무엇으로 답할지 고르는 일과
// 무엇을 물을지 쓰는 일이 같은 자리에서 끝나야 하기 때문이다.
//
// Ask   답만 만든다. 답에 코드가 있으면 [복사] [에디터로]가 달린 블록으로 나온다.
// Agent 답을 만들면서 에디터 코드까지 고친다.
//
// 대화는 이용자·문제당 하나로 서버에 저장된다(DebateAiChat). 다시 들어오면 이어지고,
// 이어진 대화가 있으면 배너로 알리며 거기서 초기화할 수 있다.
//
// 리팩토링모드는 같은 화면이되, 열자마자 AI가 먼저 말한다(왜 그런 결함 코드를 만들었는지).
// Editor 세부모드에서는 그 분석만 읽고 대화는 막는다 — AI 없이 직접 고치는 모드이므로.
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DEBATEAI_MODELS, findDebateAiModel, type DebateAiModelId } from '@/app/lib/ai/debateai-models';
import type { Language } from '@/app/lib/types';
import { VoiceButton, VoiceConsentDialog, VoiceWaveform, useVoiceInput } from '@/app/study/search/voice-input';
import { voiceConsentStrings } from '@/app/study/search/voice-strings';
import { useLanguage } from '@/app/context/language-context';
import PromptSuggestions from './prompt-suggestions-bar';
import ModelMenu from './model-menu';
import ChatCodeBlock from './chat-code-block';
import AnswerToolbar, { type AnswerUsage } from './answer-toolbar';
import { DEFAULT_EFFORT, type Effort } from '@/app/lib/ai/effort';

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Agent로 보낸 말 — 질문과 섞이면 무엇이 코드를 바꿨는지 되짚을 수 없다 */
  command?: boolean;
  /** 이 답변에 든 토큰·강도 — 툴바의 응답 세부정보에서 보여준다 */
  usage?: AnswerUsage;
  ts?: number;
}

export type ChatMode = 'general' | 'refactor-why';
export type SendMode = 'ask' | 'agent';

export default function DebateAiChat({
  problemId,
  language,
  getCode,
  enabled,
  onRequestEasy,
  model,
  onModelChange,
  seed,
  mode = 'general',
  suggestions = [],
  /**
   * 저장 줄기 — 리팩토링 대화는 "AI가 만든 결함 코드"를 전제로 해서
   * 내 코드를 두고 나눈 학습 대화와 한 줄기로 이으면 문맥이 어긋난다.
   */
  scope = 'general',
  /** 리팩토링모드 — 열자마자 "왜 이렇게 만들었는지" 분석을 먼저 받아온다 */
  autoAnalyze = false,
  /**
   * 저장된 대화를 무시하고 새로 시작한다.
   * 리팩토링 세션이 새로 열려 결함 코드가 바뀌었을 때 — 지난 분석은 다른 코드에 대한 설명이라
   * 그대로 두면 화면의 코드와 어긋난 말을 읽게 된다.
   */
  restart = false,
  /** 읽기 전용 — 분석만 보여주고 대화는 막는다(리팩토링 Editor 모드) */
  readOnly = false,
  readOnlyNotice,
  /**
   * Agent 전용 실행기 — 서버가 코드를 직접 고쳐 주는 화면(리팩토링 Copilot)에서 쓴다.
   * 주어지면 Agent 모드의 발화가 이 함수로 가고, 돌려준 문자열이 답변으로 붙는다.
   */
  onCommand,
  /**
   * 모델이 만든 코드를 에디터에 반영한다.
   * onCommand가 없는 화면에서는 이것이 Agent 모드의 경로가 되고,
   * Ask 모드에서는 코드 블록의 "에디터로" 버튼이 쓴다.
   */
  onApplyCode,
  /** Agent 모드일 때 바꿔 낄 안내 문구 */
  commandPlaceholder,
  commandHint,
  /** Agent 모드에서 띄울 추천 프롬프트 — 질문용 목록과 성격이 다르다 */
  commandSuggestions,
  /**
   * 언제나 Agent — 리팩토링모드처럼 "코드를 고치는 것"이 그 화면의 유일한 작업일 때.
   * 고를 것이 없으므로 토글도 감춘다.
   */
  forceAgent = false,
  /** BYOK/Local 모델을 쓸 수 있는지 판단할 재료 */
  access = { hasOwnKey: false, isMate: false, hasLocalEndpoint: false },
}: {
  problemId: number;
  language: Language;
  getCode: () => string;
  enabled: boolean;
  onRequestEasy?: () => void;
  model: DebateAiModelId;
  onModelChange: (m: DebateAiModelId) => void;
  seed?: string;
  mode?: ChatMode;
  suggestions?: string[];
  scope?: 'general' | 'refactor';
  autoAnalyze?: boolean;
  restart?: boolean;
  readOnly?: boolean;
  readOnlyNotice?: string;
  onCommand?: (text: string) => Promise<string>;
  onApplyCode?: (code: string, source: 'agent' | 'block') => void;
  commandPlaceholder?: string;
  commandHint?: string;
  commandSuggestions?: string[];
  forceAgent?: boolean;
  access?: { hasOwnKey: boolean; isMate: boolean; hasLocalEndpoint: boolean };
}) {
  const { language: uiLang } = useLanguage();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [analyzing, setAnalyzing] = useState(false);
  // 저장된 대화를 불러오기 전에는 자동 분석을 돌리지 않는다 — 두 번 말하게 된다.
  // 새로 시작하는 자리(restart)는 불러올 것이 없으므로 처음부터 준비된 상태다.
  const [loaded, setLoaded] = useState(restart);
  const [resumed, setResumed] = useState(false);
  const [resetting, setResetting] = useState(false);
  // 보낸 글을 무엇으로 다룰지 — Ask(설명) / Agent(코드까지 고침)
  const [sendMode, setSendMode] = useState<SendMode>('ask');
  const [effort, setEffort] = useState<Effort>(DEFAULT_EFFORT);
  const endRef = useRef<HTMLDivElement>(null);
  const analyzed = useRef(false);
  // 생성 중단 — 서버 호출을 끊는다. 끊긴 자리는 대화에 그대로 표시한다.
  const abortRef = useRef<AbortController | null>(null);

  const agentAvailable = !!onCommand || !!onApplyCode;
  // 토글이 보이는 화면에서만 이용자가 고른다. 그 외에는 화면이 정한 대로 간다.
  const agenting = agentAvailable && (forceAgent || sendMode === 'agent');

  const appendSpoken = useCallback((spoken: string) => {
    setInput((prev) => (prev ? `${prev.replace(/\s+$/, '')} ${spoken}` : spoken));
  }, []);
  const voice = useVoiceInput({ lang: uiLang === 'en' ? 'en-US' : 'ko-KR', onCommit: appendSpoken });

  // 문제분석 탭 CTA에서 넘어온 질문 시드를 입력창에 채운다
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 CTA 시드 반영
    if (seed) setInput(seed);
  }, [seed]);

  const scrollDown = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));

  /* ---------- 저장된 대화 ---------- */

  // 대화 저장 — 턴이 끝날 때마다 통째로 덮어쓴다. 실패해도 화면은 그대로 간다.
  const persist = useCallback(
    (next: ChatTurn[]) => {
      void fetch('/api/debateai/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId, scope, messages: next.slice(-60), model }),
      }).catch(() => {});
    },
    [problemId, scope, model],
  );

  useEffect(() => {
    if (!enabled) return;
    // 새로 시작하는 자리 — 지난 대화를 불러오지 않는다.
    // 지우지는 않는다. 첫 저장이 같은 자리를 덮어쓴다.
    if (restart) return;
    let alive = true;
    fetch(`/api/debateai/session?problemId=${problemId}&scope=${scope}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { messages?: ChatTurn[]; existed?: boolean } | null) => {
        if (!alive) return;
        if (data?.messages?.length) {
          setTurns(data.messages);
          setResumed(!!data.existed);
        }
        setLoaded(true);
      })
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [problemId, scope, enabled, restart]);

  /**
   * 리팩토링모드 첫 진입 — AI가 자기 코드를 실시간으로 분석해 먼저 말한다.
   * 사용자 발화 없이 호출하므로 messages는 비운 채 refactor-why 모드로 보낸다.
   */
  const runAutoAnalysis = useCallback(async () => {
    setAnalyzing(true);
    setError(undefined);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/debateai', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          modelId: model,
          language,
          mode: 'refactor-why',
          effort,
          code: getCode(),
          messages: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '분석을 받지 못했습니다.');
      const next: ChatTurn[] = [
        { role: 'assistant', content: data.reply as string, usage: data.usage as AnswerUsage, ts: Date.now() },
      ];
      setTurns(next);
      persist(next);
      scrollDown();
    } catch (e) {
      // 이용자가 중단한 것은 오류가 아니다
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : '분석을 받지 못했습니다.');
      }
    } finally {
      abortRef.current = null;
      setAnalyzing(false);
    }
  }, [problemId, model, language, effort, getCode, persist]);

  // 자동 분석은 "이어서 볼 대화가 없을 때"만 — 저장된 대화가 있으면 그 자리를 덮지 않는다
  useEffect(() => {
    if (!autoAnalyze || !enabled || !loaded || analyzed.current) return;
    analyzed.current = true;
    if (turns.length === 0) {
      // 서버 호출을 여는 동작이다. 첫 setState는 "분석 중" 표시일 뿐이고,
      // analyzed 가드가 있어 한 번만 실행된다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void runAutoAnalysis();
    }
  }, [autoAnalyze, enabled, loaded, turns.length, runAutoAnalysis]);

  /** 초기화 — 저장된 대화를 지우고, 리팩토링모드라면 분석부터 다시 받는다 */
  async function resetSession() {
    if (resetting) return;
    setResetting(true);
    try {
      await fetch(`/api/debateai/session?problemId=${problemId}&scope=${scope}`, { method: 'DELETE' });
    } catch {
      // 서버에서 못 지워도 화면은 비운다 — 다음 저장이 덮어쓴다
    }
    setTurns([]);
    setResumed(false);
    setError(undefined);
    setResetting(false);
    if (autoAnalyze) void runAutoAnalysis();
  }

  /* ---------- 전송 ---------- */

  async function send(text?: string) {
    const value = (text ?? input).trim();
    if (!value || sending || readOnly) return;
    if (voice.listening) voice.stop();

    const asAgent = agenting;
    const nextTurns: ChatTurn[] = [...turns, { role: 'user', content: value, command: asAgent }];
    setTurns(nextTurns);
    setInput('');
    setSending(true);
    setError(undefined);
    setResumed(false);
    scrollDown();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // 서버가 코드를 직접 고쳐 주는 화면(리팩토링) — 코드 반영은 호출부가 맡는다
      if (asAgent && onCommand) {
        const reply = await onCommand(value);
        const done: ChatTurn[] = [...nextTurns, { role: 'assistant', content: reply }];
        setTurns(done);
        persist(done);
        scrollDown();
        return;
      }

      const res = await fetch('/api/debateai', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId,
          modelId: model,
          language,
          // 첫 발언이 분석이었더라도 이어지는 대화는 일반 학습 문맥이다
          mode: asAgent ? 'agent' : mode === 'refactor-why' ? 'general' : mode,
          effort,
          code: getCode(),
          messages: nextTurns.slice(-20).map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI 호출에 실패했습니다.');

      const done: ChatTurn[] = [
        ...nextTurns,
        { role: 'assistant', content: data.reply as string, usage: data.usage as AnswerUsage, ts: Date.now() },
      ];
      setTurns(done);
      persist(done);
      // Agent 모드에서 코드가 나왔으면 곧바로 에디터에 반영한다 — 그게 이 모드를 고른 이유다
      if (asAgent && typeof data.code === 'string' && data.code.trim()) onApplyCode?.(data.code, 'agent');
      scrollDown();
    } catch (e) {
      // 중단은 오류가 아니다 — 어디서 멈췄는지만 대화에 남긴다
      if (e instanceof DOMException && e.name === 'AbortError') {
        const stopped: ChatTurn[] = [...nextTurns, { role: 'assistant', content: '_(생성을 중단했습니다.)_', ts: Date.now() }];
        setTurns(stopped);
        persist(stopped);
      } else {
        setError(e instanceof Error ? e.message : 'AI 호출에 실패했습니다.');
      }
    } finally {
      abortRef.current = null;
      setSending(false);
    }
  }

  /** 생성 중단 — 진행 중인 호출을 끊는다 */
  function stopGenerating() {
    abortRef.current?.abort();
  }

  if (!enabled) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm space-y-3 rounded-xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-2xl">🔒</p>
          <p className="text-sm font-semibold text-white">debateAI는 쉬움 난이도에서만 쓸 수 있습니다</p>
          <p className="text-xs leading-relaxed text-white/50">
            <strong className="text-white/70">쉬움</strong>은 debateAI에게 물어보며 코드를 작성하는 난이도입니다.
            <strong className="text-white/70"> 보통</strong>은 같은 시작 코드를 혼자 완성하고,
            <strong className="text-white/70"> 어려움</strong>은 빈 코드에서 전부 직접 작성합니다.
            {!onRequestEasy && ' 여기서는 난이도를 바꿀 수 없습니다.'}
          </p>
          {onRequestEasy && (
            <button
              type="button"
              onClick={onRequestEasy}
              className="rounded-lg bg-signal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
            >
              쉬움 난이도로 전환하기
            </button>
          )}
        </div>
      </div>
    );
  }

  const current = findDebateAiModel(model);
  const busy = sending || analyzing;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 이어서 보는 대화 — 언제 것인지 모른 채 이어 붙는 일이 없게 알리고, 여기서 지울 수 있다 */}
      {resumed && (
        <div className="flex items-center gap-2 border-b border-brand-400/20 bg-signal/[0.08] px-3 py-2 text-[11px] text-brand-200">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-[1.6]" aria-hidden>
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="min-w-0 truncate">이 문제에서 나눈 이전 대화를 이어가고 있습니다.</span>
          <button
            type="button"
            onClick={() => void resetSession()}
            disabled={resetting}
            className="ml-auto shrink-0 rounded-md border border-brand-400/30 px-2 py-0.5 font-semibold transition-colors hover:bg-brand-400/10 disabled:opacity-40"
          >
            {resetting ? '초기화 중…' : '초기화'}
          </button>
          <button
            type="button"
            onClick={() => setResumed(false)}
            aria-label="배너 닫기"
            className="shrink-0 rounded-md px-1 text-brand-200/60 transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {/* 대화 목록 */}
      <div className="dc-scroll flex-1 space-y-4 overflow-y-auto p-4">
        {turns.length === 0 && !analyzing && (
          <div className="rounded-xl border border-signal/20 bg-signal/10 p-4 text-xs leading-relaxed text-white/70">
            <p className="mb-1 font-semibold text-brand-300">debateAI</p>
            문제 설명과 에디터의 현재 코드를 보고 있어요. 문제 이해나 접근법에 대해 무엇이든 질문해 주세요. 정답
            대신 스스로 풀 수 있는 힌트를 드립니다.
            {agentAvailable && (
              <p className="mt-2 text-white/45">
                코드를 직접 고쳐 주길 원하면 입력창에서 <strong className="text-brand-300">Agent</strong>로 바꿔 주세요.
              </p>
            )}
          </div>
        )}

        {analyzing && (
          <div className="rounded-xl border border-brand-400/25 bg-signal/10 p-4">
            <p className="mb-1.5 font-mono text-[10px] text-brand-300">ANALYZING</p>
            <p className="text-xs text-white/60">
              {current.label}이(가) 이 문제와 방금 작성한 코드를 분석하고 있습니다
              <span className="animate-pulse">…</span>
            </p>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                t.role === 'user'
                  ? t.command
                    ? 'border border-brand-400/40 bg-white/10 text-white whitespace-pre-wrap'
                    : 'bg-signal text-white whitespace-pre-wrap'
                  : 'min-w-0 border border-white/10 bg-white/[0.06] text-white/90'
              }`}
            >
              {t.command && <p className="mb-1 font-mono text-[10px] text-brand-200">Agent</p>}
              {t.role === 'assistant' ? (
                <>
                  <p className="mb-1 font-mono text-[10px] text-brand-300">{current.label}</p>
                  <div className="[&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        // 코드 블록은 읽고 끝나지 않게 [복사] [에디터로]를 달아 둔다
                        pre: ({ children }) => (
                          <ChatCodeBlock onApply={onApplyCode && ((c) => onApplyCode(c, 'block'))}>
                            {children}
                          </ChatCodeBlock>
                        ),
                      }}
                    >
                      {t.content}
                    </ReactMarkdown>
                  </div>
                  {/* AI Search와 같은 구성의 툴바 — 토큰 수는 여기 세부정보에 있다 */}
                  <AnswerToolbar
                    content={t.content}
                    modelId={model}
                    usage={t.usage}
                    createdAt={t.ts}
                    query={[...turns.slice(0, i)].reverse().find((x) => x.role === 'user')?.content ?? ''}
                    busy={busy}
                  />
                </>
              ) : (
                t.content
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 font-mono text-xs text-white/50">
              {agenting ? '코드를 고치는 중' : '생각 중'}
              <span className="animate-pulse">…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* ---------- 입력 영역 ---------- */}
      <div className="border-t border-white/10 p-3">
        {error && (
          <p className="mb-2 text-xs text-rose-400" role="alert">
            {error}
          </p>
        )}

        {readOnly ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs leading-relaxed text-white/50">
            {readOnlyNotice ?? 'AI 도움 없이 직접 수정하는 모드입니다. 위 분석만 참고해 주세요.'}
          </p>
        ) : (
          <>
            {/* 추천 프롬프트 — 접었다 펼 수 있는 가로 슬라이드. Ask/Agent에 따라 목록이 갈린다 */}
            <PromptSuggestions
              items={agenting ? (commandSuggestions ?? []) : suggestions}
              disabled={busy}
              onPick={(p) => void send(p)}
            />

            <div
              className={`rounded-2xl border bg-white/5 transition-colors focus-within:border-signal/60 ${
                agenting ? 'border-brand-400/35' : 'border-white/10'
              }`}
            >
              {voice.listening ? (
                <div className="px-2 pt-2">
                  <VoiceWaveform
                    analyser={voice.analyser}
                    transcript={input}
                    interim={voice.interim}
                    placeholder="듣고 있습니다. 말씀해 주세요…"
                    tone="dark"
                  />
                </div>
              ) : (
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={1}
                  disabled={busy}
                  placeholder={
                    agenting
                      ? (commandPlaceholder ?? '고칠 곳을 지시하세요 — 예: "정렬 대신 해시맵을 써서 O(n)으로 바꿔줘"')
                      : '문제나 코드에 대해 무엇이든 물어보세요'
                  }
                  aria-label="debateAI에게 보낼 메시지"
                  className="dc-scroll max-h-28 w-full resize-none bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
              )}

              {/* 하단 줄 — [모델] [Ask|Agent] ····· [음성] [전송] */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 pb-2">
                {/* 강도(Effort)는 이 메뉴 안에 함께 들어 있다 */}
                <ModelMenu
                  value={model}
                  onChange={onModelChange}
                  effort={effort}
                  onEffortChange={setEffort}
                  disabled={busy}
                  access={access}
                />

                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {/* Ask / Agent — 전송 직전에 눈이 닿는 자리(음성 왼쪽)에 붙인다.
                      리팩토링모드처럼 고를 것이 없는 화면에서는 아예 감춘다. */}
                  {agentAvailable && !forceAgent && (
                    <div
                      role="group"
                      aria-label="보내기 방식"
                      className="flex h-7 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.04] p-0.5 text-[10px] font-semibold"
                    >
                      {(
                        [
                          ['ask', 'Ask'],
                          ['agent', 'Agent'],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          disabled={busy}
                          aria-pressed={sendMode === key}
                          onClick={() => setSendMode(key)}
                          title={
                            key === 'ask'
                              ? '답변만 만듭니다 — 에디터 코드는 그대로입니다'
                              : '답변과 함께 에디터의 코드를 고칩니다'
                          }
                          className={`rounded-full px-2 py-0.5 transition-colors disabled:opacity-40 ${
                            sendMode === key ? 'bg-signal text-white' : 'text-white/45 hover:text-white/75'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <VoiceButton
                    listening={voice.listening}
                    onClick={voice.toggle}
                    disabled={busy || !voice.supported}
                    label="음성으로 입력"
                    stopLabel="음성 입력 끝내기"
                    tone="dark"
                  />
                  {/* 생성 중에는 같은 자리가 중단 버튼이 된다 — 누를 곳을 찾아 헤매지 않도록 */}
                  {busy ? (
                    <button
                      type="button"
                      onClick={stopGenerating}
                      title="생성 중단"
                      aria-label="생성 중단"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink transition hover:bg-white/85 active:scale-95"
                    >
                      <span aria-hidden className="relative grid h-full w-full place-items-center">
                        <span className="absolute inset-[3px] animate-spin rounded-full border-2 border-ink/15 border-t-ink/60 motion-reduce:animate-none" />
                        <span className="block h-[9px] w-[9px] rounded-[2px] bg-ink" />
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={!input.trim()}
                      title="전송"
                      aria-label="전송"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-signal text-white shadow-[0_2px_8px_rgba(24,0,172,0.35)] transition-all hover:shadow-[0_3px_12px_rgba(24,0,172,0.5)] active:scale-95 disabled:bg-none disabled:bg-white/10 disabled:text-white/25 disabled:shadow-none"
                    >
                      {/* 오른쪽을 향한 종이비행기 — 뾰족한 끝이 진행 방향(전송)을 가리킨다.
                          가로로 누운 도형이라 시각 중심이 왼쪽으로 쏠려, viewBox를 살짝 밀어(-0.8) 맞춘다. */}
                      <svg viewBox="-0.8 0 24 24" className="h-[17px] w-[17px]" aria-hidden>
                        <path d="M20.6 12 4.1 3.9 7.6 12Z" fill="currentColor" />
                        <path d="M20.6 12 4.1 20.1 7.6 12Z" fill="currentColor" fillOpacity="0.72" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className={`mt-1.5 text-[10px] ${busy ? 'text-white/40' : agenting ? 'text-brand-300/70' : 'text-white/30'}`}>
              {busy
                ? '생성 중입니다 — 멈추려면 중단 버튼을 눌러 주세요'
                : agenting
                  ? (commandHint ?? 'Enter 전송 · 답변과 함께 에디터의 코드가 다시 쓰입니다')
                  : 'Enter 전송 · Shift+Enter 줄바꿈 · 파일 첨부는 지원하지 않습니다'}
            </p>
          </>
        )}
      </div>

      <VoiceConsentDialog
        open={voice.askingConsent}
        onAccept={voice.acceptConsent}
        onDecline={voice.declineConsent}
        permission={voice.permission}
        strings={voiceConsentStrings(uiLang)}
      />
    </div>
  );
}

export { DEBATEAI_MODELS };
