'use client';

// 리팩토링모드 진입 연출 — 에디터 위에 덮여 AI가 코드를 만드는 과정을 보여 준다.
//
//   분석 중  →  작성 중(코드가 한 줄씩 내려간다)  →  완성된 코드
//
// 서버가 코드를 다 만들어 한 번에 내려주므로, 화면에는 이미 받아 둔 코드를 순서대로 푼다.
// 연출이 사실과 어긋나지 않도록 순서를 지킨다 — 코드가 도착하기 전에는 작성 단계로 넘어가지
// 않고, 도착한 뒤에만 줄이 흐른다. 기다린 시간만큼 헛돌지 않게, 늦게 도착하면 그만큼 빨리 푼다.
import { useEffect, useMemo, useRef, useState } from 'react';

/** 줄당 기본 노출 간격 — 전체가 이 시간을 넘기면 아래에서 줄인다. */
const LINE_MS = 38;
const MAX_WRITE_MS = 2600;
/** 코드가 곧바로 와도 분석 단계를 이 정도는 보여 준다 — 깜빡이고 사라지면 읽을 수 없다. */
const MIN_ANALYZE_MS = 900;

export default function AgentCodegen({
  code,
  language,
  onDone,
}: {
  /** 서버에서 받은 결함 코드 — 아직 못 받았으면 null(분석 단계 유지) */
  code: string | null;
  language: string;
  onDone: () => void;
}) {
  const [stage, setStage] = useState<'analyze' | 'write'>('analyze');
  const [shown, setShown] = useState(0);
  // 마운트 시각 — 렌더 중에는 시계를 읽지 않는다(리렌더마다 값이 흔들린다)
  const startedAt = useRef(0);
  const bodyRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  // 콜백을 ref에 담아 둔다 — 부모가 리렌더될 때마다 새 함수가 와서
  // 아래 타이머가 초기화되면 줄이 흐르다 멈춘 것처럼 보인다
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const lines = useMemo(() => (code ? code.split('\n') : []), [code]);

  // 분석 → 작성 전환. 코드가 도착하고, 최소 노출 시간을 채운 뒤에 넘어간다.
  useEffect(() => {
    if (!code || stage === 'write') return;
    const waited = Date.now() - startedAt.current;
    const timer = setTimeout(() => setStage('write'), Math.max(0, MIN_ANALYZE_MS - waited));
    return () => clearTimeout(timer);
  }, [code, stage]);

  // 작성 — 한 줄씩 늘려 간다. 마지막 줄까지 채우면 잠깐 두었다가 실제 에디터로 넘긴다.
  useEffect(() => {
    if (stage !== 'write' || lines.length === 0) return;
    if (shown >= lines.length) {
      const timer = setTimeout(() => doneRef.current(), 420);
      return () => clearTimeout(timer);
    }
    const step = Math.max(12, Math.min(LINE_MS, MAX_WRITE_MS / lines.length));
    const timer = setTimeout(() => setShown((n) => n + 1), step);
    return () => clearTimeout(timer);
  }, [stage, shown, lines.length]);

  // 커서가 항상 보이게 따라 내려간다
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [shown]);

  const writing = stage === 'write';
  const progress = lines.length > 0 ? Math.round((shown / lines.length) * 100) : 0;

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#0B0D12]">
      {/* 상태 줄 — 지금 어느 단계인지 한 줄로 남긴다 */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-2.5">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(69,49,217,0.9)] motion-safe:animate-pulse"
        />
        <p className="min-w-0 truncate text-[12px] text-fg-on-dark" role="status" aria-live="polite">
          {writing ? (
            <>
              Agent가 코드를 작성하고 있습니다
              <span className="ml-1.5 font-mono text-[10px] text-fg-on-dark-quiet">
                {shown}/{lines.length} lines
              </span>
            </>
          ) : (
            <>
              Agent가 문제를 분석하고 있습니다
              <span className="ml-1 motion-safe:animate-pulse">…</span>
            </>
          )}
        </p>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-on-dark-quiet">
          solution.{language === 'python' ? 'py' : 'js'}
        </span>
      </div>

      {/* 진행 막대 — 분석 단계에서는 목적지를 모르므로 좌우로 흐르게 둔다 */}
      <div className="h-px w-full overflow-hidden bg-white/10">
        {writing ? (
          <div className="h-full bg-brand-400 transition-[width] duration-150 ease-linear" style={{ width: `${progress}%` }} />
        ) : (
          <div className="dc-indeterminate h-full w-1/3 bg-brand-400/70" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {writing ? (
          <pre
            ref={bodyRef}
            className="dc-scroll h-full overflow-auto px-4 py-3 font-mono text-[12.5px] leading-[1.55] text-fg-on-dark"
          >
            {lines.slice(0, shown).map((line, i) => (
              <div key={i} className="flex motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1 motion-safe:duration-200">
                <span aria-hidden className="mr-3 w-7 shrink-0 select-none text-right text-fg-on-dark-quiet">
                  {i + 1}
                </span>
                <span className="whitespace-pre-wrap break-words">{line || ' '}</span>
              </div>
            ))}
            {shown < lines.length && (
              <div className="flex">
                <span aria-hidden className="mr-3 w-7 shrink-0 select-none text-right text-fg-on-dark-quiet">
                  {shown + 1}
                </span>
                <span aria-hidden className="inline-block h-[1.1em] w-[7px] translate-y-[2px] bg-brand-300 motion-safe:animate-pulse" />
              </div>
            )}
          </pre>
        ) : (
          // 분석 단계 — 아직 보여 줄 코드가 없다. 무엇을 읽고 있는지만 알린다.
          <div className="flex h-full flex-col justify-center gap-2.5 px-6">
            {['문제 조건과 입출력 형식을 읽는 중', '접근 방식을 정하는 중', '테스트 케이스의 경계를 확인하는 중'].map(
              (text, i) => (
                <p
                  key={text}
                  className="flex items-center gap-2.5 text-[12px] text-fg-on-dark-quiet motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
                  style={{ animationDelay: `${i * 260}ms`, animationFillMode: 'backwards' }}
                >
                  <span aria-hidden className="h-1 w-1 rounded-full bg-brand-400/70" />
                  {text}
                </p>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
