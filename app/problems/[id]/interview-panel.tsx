'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSpeech } from '@/app/lib/speech';
import { useLanguage } from '@/app/context/language-context';
import ModelMenu from './model-menu';
import { DEFAULT_EFFORT, type Effort } from '@/app/lib/ai/effort';
import { DEFAULT_CODE_MODEL_ID, findDebateAiModel, type DebateAiModelId } from '@/app/lib/ai/debateai-models';
import { DEFAULT_INTERVIEW_CONFIG, FOCUS_LABELS, LEVEL_LABELS, type InterviewConfig } from '@/app/lib/ai/interview-config';
import type { DefenseReport, RoundEval, RoundVerdict } from '@/app/lib/types';

export type InterviewMode = 'basic' | 'strict';

/** 답변 말풍선에 붙일 면접관 모델 이름 */
function findLabel(modelId: string): string {
  return findDebateAiModel(modelId).label;
}

const STRICT_SECONDS = 90; // 엄격 모드: 답변당 제한 시간

interface Message {
  role: 'ai' | 'user';
  content: string;
  /** true면 타자기 효과로 출력 */
  typing?: boolean;
  evaluation?: RoundEval;
}

const VERDICT_STYLE: Record<RoundVerdict, { label: string; className: string }> = {
  DEFENDED: { label: '방어 성공', className: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' },
  PARTIAL: { label: '부분 방어', className: 'text-brand-400 border-brand-500/40 bg-brand-600/10' },
  CONCEDED: { label: '방어 실패', className: 'text-rose-400 border-rose-500/40 bg-rose-500/10' },
};

function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown((s) => Math.min(text.length, s + 2)), 18);
    return () => clearTimeout(t);
  }, [shown, text]);
  return (
    <>
      {text.slice(0, shown)}
      {shown < text.length && (
        <span className="inline-block w-1.5 h-3.5 bg-signal/80 align-middle ml-0.5" style={{ animation: 'dc-blink 1s infinite' }} />
      )}
    </>
  );
}

export default function InterviewPanel({
  sessionId,
  firstQuestion,
  getCurrentCode,
  mode,
  voice,
  config = DEFAULT_INTERVIEW_CONFIG,
  model = DEFAULT_CODE_MODEL_ID,
  onModelChange,
  access = { hasOwnKey: false, hasLocalEndpoint: false },
}: {
  sessionId: string;
  firstQuestion: string;
  getCurrentCode: () => string;
  mode: InterviewMode;
  voice: boolean;
  /** 입장 전에 고른 문항 수·난이도·경향 — 헤더에 그대로 밝힌다 */
  config?: InterviewConfig;
  model?: DebateAiModelId;
  onModelChange?: (m: DebateAiModelId) => void;
  access?: { hasOwnKey: boolean; hasLocalEndpoint: boolean };
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', content: firstQuestion, typing: true },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [round, setRound] = useState(1);
  const maxRounds = config.rounds;
  // 면접관 모델·강도 — debateAI 탭과 같은 메뉴를 쓴다(설정에서 고른 기본 모델로 시작)
  const [effort, setEffort] = useState<Effort>(DEFAULT_EFFORT);
  const [report, setReport] = useState<DefenseReport | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(mode === 'strict' ? STRICT_SECONDS : null);

  const initialCodeRef = useRef<string>(getCurrentCode());
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // 면접에서는 음성 입력을 두지 않는다. 말한 것이 그대로 기록되고 평가되는 자리라,
  // 받아쓰기가 한 글자만 틀려도 답변이 아니라 인식 오류를 변호하게 된다.
  const { language: uiLang } = useLanguage();
  // 면접관 질문 낭독 — 긴 질문이 중간에 끊기지 않도록 공용 훅을 쓴다
  const { speak, stop: stopSpeaking } = useSpeech(uiLang);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking, report]);

  // 보이스 모드: 첫 질문 낭독
  useEffect(() => {
    if (voice) speak(firstQuestion);
    return stopSpeaking;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = useCallback(
    async (forcedAnswer?: string) => {
      const answer = (forcedAnswer ?? inputRef.current).trim();
      if (!answer || report) return;
      setInput('');
      setTimeLeft(null); // 답변 제출 → 타이머 정지
      setMessages((prev) => [...prev, { role: 'user', content: answer }]);
      setThinking(true);

      try {
        const currentCode = getCurrentCode();
        const res = await fetch(`/api/interview/${sessionId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answer,
            currentCode: currentCode !== initialCodeRef.current ? currentCode : undefined,
          }),
        });
        const data = await res.json();
        await new Promise((r) => setTimeout(r, 800));

        if (!res.ok) {
          setMessages((prev) => [...prev, { role: 'ai', content: data.error ?? '오류가 발생했습니다.' }]);
          return;
        }

        if (data.done) {
          setMessages((prev) => [
            ...prev,
            { role: 'ai', content: data.closing, typing: true, evaluation: data.evaluation },
          ]);
          if (voice) speak(data.closing);
          setTimeout(() => setReport(data.report), data.closing.length * 18 + 600);
        } else {
          setRound(data.round);
          setMessages((prev) => [
            ...prev,
            { role: 'ai', content: data.nextQuestion, typing: true, evaluation: data.evaluation },
          ]);
          if (voice) speak(data.nextQuestion);
          if (mode === 'strict') setTimeLeft(STRICT_SECONDS);
        }
      } catch {
        setMessages((prev) => [...prev, { role: 'ai', content: '네트워크 오류가 발생했습니다. 다시 시도해 주세요.' }]);
      } finally {
        setThinking(false);
      }
    },
    [getCurrentCode, mode, report, sessionId, voice, speak],
  );

  // 엄격 모드: 카운트다운
  useEffect(() => {
    if (timeLeft === null || thinking || report) return;
    if (timeLeft <= 0) {
      send('(시간 초과 — 제한 시간 안에 답변하지 못했습니다)');
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, thinking, report, send]);

  return (
    <div className="flex flex-col flex-grow min-h-0">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/10 bg-white/[0.02]">
        <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
        <span className="font-mono text-xs text-fg-on-dark-secondary">DebateAI 면접관</span>
        <span
          className={`font-mono text-[10px] px-2 py-0.5 rounded-full border ${
            mode === 'strict'
              ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
              : 'text-fg-on-dark-muted border-white/15 bg-white/5'
          }`}
        >
          {mode === 'strict' ? '엄격 모드' : '기본 모드'}
        </span>
        {voice && (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border text-sky-300 border-sky-500/40 bg-sky-500/10">
            🔊 보이스
          </span>
        )}
        {/* 입장 전에 고른 설정 — 왜 이런 질문이 오는지 화면에서 바로 확인된다 */}
        <span
          className="hidden font-mono text-[10px] text-fg-on-dark-quiet sm:inline"
          title={`문항 ${maxRounds} · 난이도 ${LEVEL_LABELS[config.level]} · 경향 ${FOCUS_LABELS[config.focus]}`}
        >
          {LEVEL_LABELS[config.level]} · {FOCUS_LABELS[config.focus]}
        </span>
        {timeLeft !== null && !report && (
          <span
            className={`font-mono text-xs font-bold ${timeLeft <= 15 ? 'text-rose-400 animate-pulse' : 'text-fg-on-dark-secondary'}`}
          >
            ⏱ {String(Math.floor(timeLeft / 60))}:{String(timeLeft % 60).padStart(2, '0')}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-fg-on-dark-quiet">
          ROUND {Math.min(round, maxRounds)}/{maxRounds}
        </span>
      </div>

      {/* 메시지 목록 */}
      <div ref={scrollRef} className="flex-grow overflow-y-auto dc-scroll px-5 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i}>
            {m.evaluation && (
              <div className={`mb-3 rounded-lg border px-3.5 py-2.5 text-xs ${VERDICT_STYLE[m.evaluation.verdict].className}`}>
                <div className="flex items-center justify-between font-mono">
                  <span className="font-semibold">{VERDICT_STYLE[m.evaluation.verdict].label}</span>
                  <span>{m.evaluation.score}점</span>
                </div>
                <p className="mt-1 text-fg-on-dark-secondary">{m.evaluation.feedback}</p>
              </div>
            )}
            <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-[var(--radius-panel)] px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-signal text-white whitespace-pre-wrap'
                    : 'border border-white/10 bg-white/[0.06] text-fg-on-dark'
                }`}
              >
                {m.role === 'ai' && <p className="mb-1 font-mono text-[10px] text-brand-300">면접관 · {findLabel(model)}</p>}
                {m.typing ? <Typewriter text={m.content} /> : m.content}
              </div>
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-[var(--radius-panel)] border border-white/10 bg-white/[0.06] px-4 py-3 font-mono text-xs text-fg-on-dark-muted">
              답변을 심사하는 중<span className="animate-pulse">…</span>
            </div>
          </div>
        )}

        {/* 최종 리포트 카드 */}
        {report && (
          <div className="rounded-xl border border-signal/30 bg-signal/[0.04] overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="font-mono text-xs text-brand-300 tracking-wider">방어 리포트</span>
              <span className="font-mono text-[10px] text-fg-on-dark-quiet">debate.code</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-4xl font-bold ${report.defenseScore >= 70 ? 'text-emerald-400' : report.defenseScore >= 50 ? 'text-brand-300' : 'text-rose-400'}`}
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  {report.defenseScore}%
                </span>
                <span className="text-sm text-fg-on-dark-secondary">방어 성공률</span>
              </div>
              <p className="text-sm text-fg-on-dark leading-relaxed">{report.summary}</p>

              <div className="space-y-1.5">
                {report.rounds.map((r) => (
                  <div key={r.round} className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-fg-on-dark-quiet w-8">R{r.round}</span>
                    <span className={`px-2 py-0.5 rounded border text-[10px] ${VERDICT_STYLE[r.verdict].className}`}>
                      {VERDICT_STYLE[r.verdict].label}
                    </span>
                    <span className="text-fg-on-dark-muted">{r.score}점</span>
                  </div>
                ))}
              </div>

              {report.weakKeywords.length > 0 && (
                <div>
                  <p className="font-mono text-[11px] text-fg-on-dark-quiet mb-2 tracking-wider">약점 키워드 → 오답노트 적재됨</p>
                  <div className="flex flex-wrap gap-1.5">
                    {report.weakKeywords.map((k) => (
                      <span key={k} className="px-2.5 py-1 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300 text-[11px]">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Link
                  href="/dashboard"
                  className="px-4 py-2.5 bg-signal text-white rounded-xl text-xs font-semibold hover:bg-brand-600 transition-colors"
                >
                  대시보드에서 확인
                </Link>
                <Link
                  href="/problems"
                  className="px-4 py-2.5 border border-white/15 rounded-xl text-xs text-fg-on-dark-secondary hover:bg-white/5 transition-colors"
                >
                  다른 문제 풀기
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 입력 영역 — debateAI 탭과 같은 카드. 다만 Ask/Agent는 없다.
          면접에서 보내는 말은 언제나 "답변"이라 고를 것이 없기 때문이다. */}
      {!report && (
        <div className="border-t border-white/10 p-3">
          <div className="rounded-[var(--radius-panel)] border border-white/10 bg-white/5 transition-colors focus-within:border-signal/60">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              disabled={thinking}
              placeholder="설계 의도를 논리적으로 방어하세요"
              aria-label="면접 답변"
              className="dc-scroll max-h-28 w-full resize-none bg-transparent px-4 py-2.5 text-sm text-white placeholder:text-fg-on-dark-quiet focus:outline-none disabled:cursor-not-allowed"
            />

            {/* 하단 줄 — [모델·강도] ····· [전송] */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 pb-2">
              <ModelMenu
                value={model}
                onChange={(m) => onModelChange?.(m)}
                effort={effort}
                onEffortChange={setEffort}
                disabled={thinking || !onModelChange}
                access={access}
              />

              <span className="hidden truncate font-mono text-[10px] text-fg-on-dark-quiet sm:inline">
                라운드 {Math.min(round, maxRounds)}/{maxRounds}
              </span>

              <div className="ml-auto flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={thinking || !input.trim()}
                  title="반박 제출"
                  aria-label="반박 제출"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-signal text-white shadow-[0_2px_8px_rgba(24,0,172,0.35)] transition-[color,background-color,border-color,box-shadow,transform] hover:shadow-[0_3px_12px_rgba(24,0,172,0.5)] active:scale-95 disabled:bg-none disabled:bg-white/10 disabled:text-fg-on-dark-quiet disabled:shadow-none"
                >
                  {thinking ? (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />
                  ) : (
                    <svg viewBox="-0.8 0 24 24" className="h-[17px] w-[17px]" aria-hidden>
                      <path d="M20.6 12 4.1 3.9 7.6 12Z" fill="currentColor" />
                      <path d="M20.6 12 4.1 20.1 7.6 12Z" fill="currentColor" fillOpacity="0.72" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <p className="mt-1.5 text-[10px] text-fg-on-dark-quiet">
            Enter 전송 · Shift+Enter 줄바꿈 · 우측 에디터에서 코드를 고친 뒤 답변하면 면접관이 변경을 인지합니다
          </p>
        </div>
      )}

    </div>
  );
}
