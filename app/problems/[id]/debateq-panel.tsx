'use client';

// debateQ 패널 — 문제집 워크스페이스의 debateQ 토글이 ON일 때 렌더된다 (별도 페이지 없음).
// 레이아웃은 랜딩 데모(EditorShowcase)와 동일: 좌 #12141C 밑줄 탭 패널 · 우 검정 에디터 카드.
// 세부 모드가 두 가지다.
//   Copilot  코드를 직접 못 쓴다 — AI에게 명령해 고치고, 전체 통과하면 면접으로 전환.
//   Editor   같은 결함 코드를 AI 없이 직접 고친다.
//
// 코드 명령은 별도 탭이 아니라 debateAI 탭 하나로 모았다. AI가 왜 그런 코드를 만들었는지
// 해명하는 자리와, 그 코드를 고치라고 시키는 자리가 나뉘어 있을 이유가 없기 때문이다.
// 면접 단계로 넘어가면 그때 면접 탭이 따로 열린다.
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { runJudge } from '@/app/lib/judge/client';
import { analyzeCode } from '@/app/lib/ai/mock-interviewer';
import { extractPromptHistory, promptQuestion, totalPromptRounds } from '@/app/lib/debateq-prompts';
import EditorPanel from './editor-panel';
import DebateAiChat from './debateai-chat';
import AgentCodegen from './agent-codegen';
import OutputPanel from './output-panel';
import { SplitHandle, useSplitPct } from './split-pane';
import { type DebateAiModelId } from '@/app/lib/ai/debateai-models';
import type { RefactorMode, WorkspaceProblem } from './workspace';
import {
  DIFFICULTY_LABELS,
  LANGUAGE_LABELS,
  type CaseResult,
  type ChatMessage,
  type CodeRecord,
  type DefenseReport,
  type Language,
  type RoundEval,
  type RoundVerdict,
} from '@/app/lib/types';

// POST /api/debateq 응답 — 토글 ON 시 세션 전체 상태를 받아 이 패널을 초기화한다
export interface DebateQSessionPayload {
  sessionId: string;
  language: Language;
  code: string;
  messages: ChatMessage[];
  round: number;
  attempts: number;
  codeHistory: CodeRecord[];
  completed: boolean;
  report: DefenseReport | null;
  resumed: boolean;
}

type SidebarTab = 'debateai' | 'chat' | 'problem' | 'analysis' | 'attempts';
type Phase = 'BUILD' | 'INTERVIEW';

// 리팩토링모드 debateAI 탭의 추천 질문 — 결함 코드를 앞에 두고 물어볼 만한 것들
const REFACTOR_PROMPTS = [
  '어느 부분부터 살펴봐야 하나요?',
  '이 코드가 어떤 입력에서 깨질 수 있나요?',
  '지금 구조에서 성능 문제가 생길 지점은 어디인가요?',
  '이 접근법 자체가 맞는 방향인가요?',
  '비슷한 실수를 피하려면 무엇을 확인해야 하나요?',
];

// 코드 명령용 추천 — 질문과 달리 "무엇을 어떻게 바꿔라"의 꼴이어야 한다
const COMMAND_PROMPTS = [
  '시간 복잡도를 줄여줘',
  '엣지 케이스(빈 입력·중복 값)를 처리하도록 고쳐줘',
  '중첩 반복문을 해시맵으로 바꿔줘',
  '변수명을 의미가 드러나게 정리해줘',
  '경계 조건에서 나는 오류를 고쳐줘',
];

const VERDICT_STYLE: Record<RoundVerdict, string> = {
  DEFENDED: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  PARTIAL: 'bg-brand-600/15 text-brand-300 border-brand-500/30',
  CONCEDED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};
const VERDICT_LABEL: Record<RoundVerdict, string> = {
  DEFENDED: '방어 성공',
  PARTIAL: '부분 방어',
  CONCEDED: '방어 실패',
};

export default function DebateQPanel({
  session,
  problem,
  builtinLive,
  onSessionChange,
  chatModel,
  onChatModelChange,
  refactorMode,
  aiAccess = { hasOwnKey: false, isMate: false, hasLocalEndpoint: false },
}: {
  session: DebateQSessionPayload;
  problem: WorkspaceProblem;
  builtinLive: boolean;
  onSessionChange: (s: DebateQSessionPayload) => void;
  chatModel: DebateAiModelId;
  onChatModelChange: (m: DebateAiModelId) => void;
  /** copilot: AI 프롬프트로만 수정 / editor: 직접 수정 */
  refactorMode: RefactorMode;
  /** BYOK/Local 모델 사용 가능 여부 판단 재료 */
  aiAccess?: { hasOwnKey: boolean; isMate: boolean; hasLocalEndpoint: boolean };
}) {
  const { sessionId, language } = session;
  const [code, setCode] = useState(session.code);
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [input, setInput] = useState('');
  const [round, setRound] = useState(session.round);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(session.completed);
  const [report, setReport] = useState<DefenseReport | null>(session.completed ? session.report : null);
  const [lastEval, setLastEval] = useState<RoundEval | null>(null);

  // 면접 라운드가 이미 진행된 세션은 면접 모드에서 복원한다
  const [phase, setPhase] = useState<Phase>(
    session.completed || session.round > 1 || (session.report?.rounds?.length ?? 0) > 0 ? 'INTERVIEW' : 'BUILD',
  );
  // BUILD 단계에서는 debateAI가 유일한 대화 자리다 — 면접이 시작돼야 면접 탭이 생긴다
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(
    session.completed || session.round > 1 ? 'chat' : 'debateai',
  );

  // 코드 생성 연출 — 새 세션에 들어오거나 명령으로 코드를 다시 쓸 때 에디터를 덮는다.
  // codegenCode가 null인 동안은 "분석 중", 코드가 들어오면 "작성 중"으로 넘어간다.
  const [codegen, setCodegen] = useState(!session.resumed);
  const [codegenCode, setCodegenCode] = useState<string | null>(session.resumed ? null : session.code);
  // 연출이 끝난 뒤에 에디터로 넣을 코드 — 서버가 이미 코드를 바꾼 경우(runCommand)에는 비어 있다
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  // 컴파일러(채점) 상태
  const [results, setResults] = useState<CaseResult[]>([]);
  const [lastRunTotal, setLastRunTotal] = useState(0);
  const [judging, setJudging] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [passedFlash, setPassedFlash] = useState(false);

  // 기록 — 모든 코드 버전은 저장되고, 기록을 누르면 그 코드가 에디터에 불러와진다
  const [attempts, setAttempts] = useState(session.attempts);
  const [history, setHistory] = useState<CodeRecord[]>(session.codeHistory);
  const [viewing, setViewing] = useState<{ index: number; record: CodeRecord } | null>(null);

  // 언어 변경 — 진행 중 세션을 접고 새 언어로 세션을 다시 연다
  const [switchingLang, setSwitchingLang] = useState(false);

  // 커스텀 스플리터 — 일반 워크스페이스와 같은 저장 키를 공유해 비율이 이어진다
  const rowRef = useRef<HTMLDivElement>(null);
  const editorColRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useSplitPct('dc:ws:split-x', 41, 24, 68);
  const [termPct, setTermPct] = useSplitPct('dc:ws:split-y', 30, 15, 70);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  const scrollDown = () => requestAnimationFrame(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }));

  async function switchLanguage(next: Language) {
    if (next === language || switchingLang) return;
    if (!window.confirm('언어를 바꾸면 진행 중인 debateQ 세션이 종료되고 새 세션이 시작됩니다. 계속할까요?')) return;
    setSwitchingLang(true);
    setError(undefined);
    try {
      const res = await fetch('/api/debateq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: problem.id, language: next, switchLanguage: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '언어 전환에 실패했습니다.');
      onSessionChange(data as DebateQSessionPayload); // key 변경으로 패널이 새 세션으로 리마운트된다
    } catch (e) {
      setError(e instanceof Error ? e.message : '언어 전환에 실패했습니다.');
      setSwitchingLang(false);
    }
  }

  // debateQ에서 코드는 리팩토링·수정 모두 불가 — 사용자가 할 수 있는 것은 실행/제출/언어 변경뿐
  // Copilot 모드에서만 에디터를 잠근다 — Editor 모드는 결함 코드를 직접 고치는 모드다.
  // 면접 단계(INTERVIEW)에서는 두 모드 모두 라이브 리팩터링을 허용한다.
  const editorReadOnly = refactorMode === 'copilot' && phase === 'BUILD';

  // 코드 명령을 낼 수 있는 상황인가 — Copilot의 BUILD 단계이고, 아직 끝나지 않았고, 실모델이 있을 때
  const commandable = refactorMode === 'copilot' && phase === 'BUILD' && !done && builtinLive;

  /**
   * debateAI 탭에서 보낸 코드 명령 — 여기서 코드를 다시 쓴다.
   *
   * 대화는 debateAI 안에서 이어지지만, 명령 기록은 messages에도 그대로 남긴다.
   * 나중에 프롬프트 면접이 "왜 그렇게 지시했는지"를 이 기록으로 되짚기 때문이다.
   * 돌려주는 문자열이 debateAI 답변으로 붙는다.
   */
  async function runCommand(text: string): Promise<string> {
    // 명령을 넣은 순간부터 에디터를 연출로 덮는다 — 코드가 언제 바뀌는지 보이게
    setCodegenCode(null);
    setCodegen(true);
    try {
      const res = await fetch(`/api/debateq/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'command', answer: text, currentCode: codeRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '명령 실행에 실패했습니다.');

      const now = Date.now();
      const note = (data.note as string) || '지시하신 대로 코드를 수정했습니다.';
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: `[명령] ${text}`, round, ts: now },
        { role: 'ai', content: note, round, ts: now },
      ]);
      setCode(data.code);
      setHistory((prev) => [...prev, { code: data.code, note: data.note ?? '', ts: now }]);
      setViewing(null);
      setCodegenCode(data.code as string);
      return note;
    } catch (e) {
      setCodegen(false);
      throw e;
    }
  }

  /**
   * 답변 속 코드 블록을 에디터로 — Editor 세부모드와 면접 단계에서만 열려 있다.
   * 사람이 직접 고치던 코드를 덮으므로 확인을 받고, 반영은 생성 연출이 끝날 때 한다.
   */
  function applyChatCode(next: string, source: 'agent' | 'block') {
    if (source === 'block' && !window.confirm('이 코드를 에디터로 옮기면 지금 코드가 덮어써집니다. 계속할까요?')) {
      return;
    }
    setCodegenCode(next);
    setCodegen(true);
    setPendingCode(next);
  }

  async function submit() {
    if (!input.trim() || sending || done) return;
    const mode = phase === 'BUILD' ? 'command' : 'answer';
    setSending(true);
    setError(undefined);
    try {
      const res = await fetch(`/api/debateq/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, answer: input, currentCode: codeRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '제출에 실패했습니다.');

      const now = Date.now();
      if (data.command) {
        // 명령 모드 — 코드가 갱신되고 라운드는 소모되지 않는다
        setMessages((prev) => [
          ...prev,
          { role: 'user', content: `[명령] ${input}`, round, ts: now },
          { role: 'ai', content: data.note || '지시하신 대로 코드를 수정했습니다.', round, ts: now },
        ]);
        setCode(data.code);
        setHistory((prev) => [...prev, { code: data.code, note: data.note ?? '', ts: now }]);
        setViewing(null);
      } else {
        const next: ChatMessage[] = [...messages, { role: 'user', content: input, round, ts: now }];
        setLastEval(data.evaluation as RoundEval);
        if (data.done) {
          next.push({ role: 'ai', content: data.closing, round, ts: now });
          setDone(true);
          setReport(data.report as DefenseReport);
        } else {
          next.push({ role: 'ai', content: data.nextQuestion, round: data.round, ts: now });
          setRound(data.round);
        }
        setMessages(next);
      }
      setInput('');
      scrollDown();
    } catch (e) {
      setError(e instanceof Error ? e.message : '제출에 실패했습니다.');
    } finally {
      setSending(false);
    }
  }

  // 실행(공개 케이스) / 제출(전체 케이스) — 제출에서 전부 통과하면 면접 모드로 전환된다
  async function handleRun(allCases: boolean) {
    if (judging || switchingLang) return;
    const cases = allCases ? problem.cases : problem.cases.filter((c) => !c.isHidden);
    setJudging(true);
    setResults([]);
    setLastRunTotal(cases.length);
    setAttempts((prev) => prev + 1);
    // 시도 횟수 서버 기록 — 실패해도 실행은 계속한다
    fetch(`/api/debateq/${sessionId}`, { method: 'PATCH' })
      .then((r) => r.json())
      .then((d) => typeof d.attempts === 'number' && setAttempts(d.attempts))
      .catch(() => {});
    try {
      const result = await runJudge({
        language,
        code: codeRef.current,
        cases,
        timeLimitMs: problem.timeLimitMs,
        onRuntimeLoading: setRuntimeLoading,
        onCaseResult: (r) => setResults((prev) => [...prev, r]),
      });
      // 전체 케이스 제출이 정답과 전부 일치 → 프롬프트 면접 모드 전환
      if (allCases && result.status === 'PASS' && phase === 'BUILD' && !done) {
        setPassedFlash(true);
        setTimeout(() => {
          setPassedFlash(false);
          setPhase('INTERVIEW');
          setSidebarTab('chat');
          setMessages((prev) => {
            const prompts = extractPromptHistory(prev);
            const intro = prompts.length
              ? `모든 테스트를 통과했습니다. 지금부터 프롬프트 면접을 시작합니다 — 입력하신 ${prompts.length}개의 프롬프트를 순서대로 되짚으며, 왜 그렇게 구사했는지 묻겠습니다.\n\n${promptQuestion(prompts, 1)}`
              : '모든 테스트를 통과했습니다. 지금부터 면접을 시작합니다 — 이 코드를 왜 이렇게 만들었는지, 어떤 트레이드오프를 택했는지 설명해 주세요.';
            return [...prev, { role: 'ai', content: intro, round, ts: Date.now() }];
          });
          scrollDown();
        }, 1400);
      }
    } finally {
      setJudging(false);
    }
  }

  const hiddenCount = problem.cases.filter((c) => c.isHidden).length;

  // 코드 명령은 debateAI 탭으로 합쳤다 — BUILD 단계에 별도 탭을 두지 않는다.
  // 면접이 시작되면 성격이 다른 대화(라운드·평가)라 그때 탭이 따로 열린다.
  const TABS: Array<{ key: SidebarTab; label: string; live?: boolean; accent?: boolean }> = [
    // debateAI가 맨 앞 — 리팩토링모드에서는 열자마자 AI가 자기 코드를 해명하는 자리다
    { key: 'debateai', label: 'debateAI', live: true, accent: true },
    ...(phase === 'INTERVIEW' ? ([{ key: 'chat', label: '면접', live: true }] as const) : []),
    { key: 'problem', label: '문제사항' },
    { key: 'analysis', label: '문제분석' },
    { key: 'attempts', label: '시도횟수' },
  ];

  return (
    <div ref={rowRef} className="flex-grow flex flex-col lg:flex-row gap-3 lg:gap-0 p-3 min-h-0 bg-white/[0.03]">
      {/* ---------- 좌: 밑줄 탭 패널 (데모와 동일한 크롬) ---------- */}
      <section
        style={{ '--left-w': `${leftPct}%` } as React.CSSProperties}
        className="flex min-h-[320px] w-full lg:min-h-0 lg:w-[var(--left-w)] lg:shrink-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#12141C]"
        aria-label="debateQ 패널"
      >
        <div className="dc-scroll-none flex items-center border-b border-white/10 text-[11px] font-medium text-white/40 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={sidebarTab === t.key}
              onClick={() => setSidebarTab(t.key)}
              className={`flex items-center gap-1 whitespace-nowrap px-3 py-2.5 transition-colors ${
                sidebarTab === t.key
                  ? 'border-b-2 border-brand-400 font-bold text-brand-400'
                  : t.accent
                    ? 'font-semibold text-brand-300/80 hover:text-brand-200'
                    : 'hover:text-white/70'
              }`}
            >
              {t.accent && (
                <span
                  aria-hidden
                  className="mr-0.5 h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(69,49,217,0.9)] motion-safe:animate-pulse"
                />
              )}
              {t.label}
              {t.live && !t.accent && (
                <span className="h-1 w-1 rounded-full bg-brand-500 animate-pulse motion-reduce:animate-none" />
              )}
            </button>
          ))}
          <span className="ml-auto shrink-0 px-3 font-mono text-[10px] text-white/30">
            {done
              ? 'COMPLETED'
              : phase === 'INTERVIEW'
                ? `ROUND ${round}/${totalPromptRounds(extractPromptHistory(messages))}`
                : 'BUILD'}
          </span>
        </div>

        {/* debateAI — 대화 유지를 위해 탭 전환에도 마운트를 유지한다.
            Copilot 모드는 이어서 물어볼 수 있고, Editor 모드는 분석만 읽는다. */}
        <div className={sidebarTab === 'debateai' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
          {/* 실모델이 없으면 Copilot에서 코드를 고칠 방법이 사라진다 — 막힌 채로 두지 않고 밝힌다 */}
          {refactorMode === 'copilot' && phase === 'BUILD' && !builtinLive && (
            <p className="border-b border-white/10 bg-white/5 px-4 py-2.5 text-[11px] leading-relaxed text-white/50">
              실모델(debateAI)이 설정되지 않아 코드 명령을 실행할 수 없습니다. 질문은 그대로 할 수 있고, 직접 고치려면
              상단에서 <strong className="text-white/75">Editor</strong>로 바꿔 주세요.
            </p>
          )}
          <DebateAiChat
            problemId={problem.id}
            language={language}
            getCode={() => code}
            enabled
            mode="refactor-why"
            scope="refactor"
            autoAnalyze
            // 세션이 새로 열렸다면 결함 코드도 새 것이다 — 지난 분석은 다른 코드 이야기다
            restart={!session.resumed}
            readOnly={refactorMode === 'editor'}
            readOnlyNotice="Editor 모드에서는 AI 도움 없이 직접 코드를 수정합니다. 위 분석만 참고해 주세요. 대화가 필요하면 상단에서 Copilot으로 바꿔 주세요."
            // Copilot의 BUILD 단계에서는 Agent가 debateQ 세션을 거쳐 코드를 고친다 —
            // 코드 이력과 프롬프트 기록이 면접 평가의 근거라 서버를 통해야 한다.
            onCommand={commandable ? runCommand : undefined}
            // 에디터를 직접 쓰는 상황에서만 답변 속 코드를 옮길 수 있다.
            // Copilot BUILD는 에디터가 잠겨 있어 옮길 자리가 없다.
            onApplyCode={editorReadOnly ? undefined : applyChatCode}
            commandHint="Enter 전송 · 보낸 지시대로 코드가 다시 쓰이고, 면접에서 이 프롬프트를 되짚습니다"
            commandSuggestions={COMMAND_PROMPTS}
            // 리팩토링 Copilot에서는 보내는 말이 곧 코드 명령이다 — 고를 것이 없어 토글을 감춘다
            forceAgent={commandable}
            model={chatModel}
            onModelChange={onChatModelChange}
            suggestions={refactorMode === 'copilot' ? REFACTOR_PROMPTS : []}
            access={aiAccess}
          />
        </div>

        {/* 코드 명령 / 면접 대화 */}
        {sidebarTab === 'chat' && (
          <>
            <div className="dc-scroll flex-1 space-y-4 overflow-y-auto p-4">
              {messages.map((m, i) => {
                const isCommand = m.role === 'user' && m.content.startsWith('[명령]');
                return (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                        m.role === 'user'
                          ? isCommand
                            ? 'bg-white/10 text-white border border-brand-400/30'
                            : 'bg-signal text-white'
                          : 'bg-white/[0.06] text-white/90 border border-white/10'
                      }`}
                    >
                      {m.role === 'ai' && <p className="mb-1 font-mono text-[10px] text-brand-300">DebateAI</p>}
                      {isCommand && <p className="mb-1 font-mono text-[10px] text-brand-200">코드 명령</p>}
                      {isCommand ? m.content.replace(/^\[명령\]\s*/, '') : m.content}
                    </div>
                  </div>
                );
              })}
              {lastEval && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs">
                    <span className={`mr-2 rounded-full border px-2 py-0.5 text-[10px] font-medium ${VERDICT_STYLE[lastEval.verdict]}`}>
                      {VERDICT_LABEL[lastEval.verdict]} · {lastEval.score}점
                    </span>
                    <span className="text-white/60">{lastEval.feedback}</span>
                  </div>
                </div>
              )}
              {report && (
                <div className="rounded-2xl border border-brand-400/30 bg-brand-900/30 p-5">
                  <p className="mb-1 font-mono text-[11px] text-brand-300">FINAL REPORT</p>
                  <p className="text-3xl font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    {report.defenseScore}%
                  </p>
                  <p className="mt-2 text-sm text-white/70 leading-relaxed">{report.summary}</p>
                  {report.weakKeywords.length > 0 && (
                    <p className="mt-2 text-xs text-white/50">보완할 개념: {report.weakKeywords.join(', ')}</p>
                  )}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 입력 */}
            {!done && (
              <div className="border-t border-white/10 p-3">
                {error && (
                  <p className="mb-2 text-xs text-rose-400" role="alert">
                    {error}
                  </p>
                )}
                {/* 이 탭은 면접 단계에서만 열린다 — BUILD의 코드 명령은 debateAI 탭으로 옮겼다 */}
                <label htmlFor="dq-input" className="sr-only">
                  면접 답변
                </label>
                <textarea
                  id="dq-input"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={1}
                  placeholder="왜 이 프롬프트를 이렇게 구사했는지 설명하세요"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-signal/60 dc-scroll"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-white/35">
                    답변은 라운드를 소모합니다 — 프롬프트 구사력·설명 능력을 종합 평가합니다 · Ctrl+Enter
                  </p>
                  <button
                    onClick={submit}
                    disabled={sending || !input.trim()}
                    className="shrink-0 rounded-xl bg-signal px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-600 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {sending ? '심사 중…' : '답변 제출'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* 문제사항 */}
        {sidebarTab === 'problem' && (
          <div className="dc-scroll flex-1 overflow-y-auto px-5 py-4">
            <article className="prose-invert max-w-none text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-brand-300 [&_h2:first-child]:mt-0 [&_p]:my-2 [&_p]:text-white/80 [&_li]:text-white/80 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-white/5 [&_pre]:border [&_pre]:border-white/10 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{problem.description}</ReactMarkdown>
            </article>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {problem.tags.map((t) => (
                <span key={t} className="font-mono text-[10px] text-white/40 bg-white/5 border border-white/10 rounded-full px-2 py-0.5">
                  #{t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 문제분석 */}
        {sidebarTab === 'analysis' && (() => {
          const a = analyzeCode(code, language);
          return (
            <div className="dc-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <p className="font-bold text-white text-sm mb-2">문제 정보</p>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {(
                    [
                      ['유형', problem.category],
                      ['난이도', DIFFICULTY_LABELS[problem.difficulty]],
                      ['언어', LANGUAGE_LABELS[language]],
                      ['테스트 케이스', `공개 ${problem.cases.length - hiddenCount} · 히든 ${hiddenCount}`],
                      ['제한 시간', `케이스당 ${problem.timeLimitMs / 1000}초`],
                    ] as const
                  ).map(([k, v]) => (
                    <p key={k} className="flex justify-between">
                      <span className="text-white/40">{k}</span>
                      <span className="text-white/70">{v}</span>
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-bold text-white text-sm mb-2">AI가 작성한 코드 실시간 분석</p>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <p className="flex justify-between">
                    <span className="text-white/40">예상 시간 복잡도</span>
                    <span className={a.hasNestedLoops ? 'text-rose-400' : 'text-emerald-400'}>{a.complexityGuess}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-white/40">중첩 반복문</span>
                    <span className={a.hasNestedLoops ? 'text-rose-400' : 'text-emerald-400'}>
                      {a.hasNestedLoops ? `${a.maxLoopDepth}중첩 감지` : '없음'}
                    </span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-white/40">감지된 자료구조</span>
                    <span className="text-white/70">{a.structures.length ? a.structures.join(', ') : '없음'}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-white/40">엣지 케이스 가드</span>
                    <span className={a.hasEdgeGuard ? 'text-emerald-400' : 'text-rose-400'}>
                      {a.hasEdgeGuard ? '감지' : '미탐지'}
                    </span>
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-brand-400/80 border-l-2 border-brand-400/40 pl-2 leading-relaxed">
                💡 {problem.category} 유형은 {problem.tags[0] ?? '패턴 인식'}과 시간 복잡도가 핵심입니다. 명령에
                자료구조·복잡도·경계 조건을 명시하면 면접에서 방어하기 좋은 코드가 나옵니다.
              </p>
            </div>
          );
        })()}

        {/* 시도횟수 — 실행 횟수 + 코드 기록 (기록을 누르면 그 코드가 에디터에 불러와진다) */}
        {sidebarTab === 'attempts' && (
          <div className="dc-scroll flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <div className="flex items-baseline justify-between">
              <p className="font-bold text-white text-sm">실행 기록 ({attempts}회)</p>
              <span className="font-mono text-[10px] text-white/35">
                {results.length > 0
                  ? `마지막 실행 ${results.filter((r) => r.status === 'pass').length}/${results.length} 통과`
                  : '이번 접속 실행 없음'}
              </span>
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] text-white/35">코드 버전 {history.length}개 — 누르면 에디터에 불러옵니다</p>
              <ul className="space-y-1.5">
                {[...history].reverse().map((rec, i) => {
                  const index = history.length - 1 - i;
                  const active = viewing?.index === index;
                  const isCurrent = index === history.length - 1;
                  return (
                    <li key={rec.ts + '-' + index}>
                      <button
                        type="button"
                        onClick={() => setViewing(active || isCurrent ? null : { index, record: rec })}
                        className={`w-full rounded-lg border p-2.5 text-left text-xs transition-colors ${
                          active
                            ? 'border-brand-400 bg-brand-500/10'
                            : 'border-white/10 bg-white/5 hover:border-white/25'
                        }`}
                      >
                        <span className="flex items-center gap-2 font-mono text-[10.5px]">
                          <span className="text-brand-300">#{index + 1}</span>
                          <span className="text-white/40 truncate">{rec.note || '코드 수정'}</span>
                          <span className="ml-auto shrink-0 text-white/30">
                            {isCurrent ? '현재' : active ? '열람 중' : new Date(rec.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* 좌/우 스플리터 (데스크톱 전용) */}
      <SplitHandle axis="x" containerRef={rowRef} onPct={setLeftPct} label="패널 너비 조절" className="hidden lg:flex" />

      {/* ---------- 우: 검정 에디터 카드 (데모와 동일한 크롬) ---------- */}
      <div className="relative flex min-h-[380px] lg:min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0B0D12]">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
          <span className="font-mono text-[10px] text-white/40">solution.{language === 'python' ? 'py' : 'js'}</span>
          <span className="text-[9px] uppercase tracking-wider text-white/20">debateQ sandbox</span>
          <span className="font-mono text-[10px] text-white/30 hidden sm:inline">
            읽기 전용 — 코드는 AI 명령으로만 수정됩니다
          </span>
          <div className="ml-auto flex items-center gap-2">
            {/* 사용자가 에디터에서 할 수 있는 것: 언어 변경 · 실행 · 제출 */}
            <select
              value={language}
              onChange={(e) => switchLanguage(e.target.value as Language)}
              disabled={judging || switchingLang || done}
              aria-label="언어 변경"
              className="bg-ink border border-white/15 rounded-lg px-2.5 py-1 font-mono text-[11px] text-white/80 focus:outline-none focus:border-signal disabled:opacity-50"
            >
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABELS[l]}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleRun(false)}
              disabled={judging || switchingLang}
              className="px-4 py-1.5 border border-white/15 rounded-lg text-[11px] font-semibold text-white/85 hover:bg-white/10 transition-colors disabled:opacity-40"
            >
              {judging ? '실행 중…' : '▶ 실행'}
            </button>
            <button
              onClick={() => handleRun(true)}
              disabled={judging || switchingLang || done}
              className="px-4 py-1.5 bg-signal text-white rounded-lg text-[11px] font-bold hover:bg-brand-600 transition-colors disabled:opacity-40"
            >
              {switchingLang ? '전환 중…' : '제출'}
            </button>
          </div>
        </div>

        {runtimeLoading && (
          <div className="border-b border-signal/20 bg-signal/10 px-4 py-2 font-mono text-[11px] text-brand-300">
            Python 런타임(Pyodide)을 불러오는 중입니다… 첫 실행은 몇 초 걸릴 수 있어요.
          </div>
        )}
        {viewing && (
          <div className="flex items-center gap-3 border-b border-brand-400/30 bg-brand-900/30 px-4 py-1.5 text-[11px] text-brand-200">
            코드 기록 #{viewing.index + 1} 열람 중 — 실행은 항상 현재 코드로 진행됩니다.
            <button
              type="button"
              onClick={() => setViewing(null)}
              className="ml-auto rounded-lg border border-brand-400/40 px-2.5 py-0.5 text-[10px] hover:bg-brand-400/10 transition-colors"
            >
              현재 코드로
            </button>
          </div>
        )}

        {/* 에디터/터미널 — 세로 스플리터로 높이 조절 */}
        <div ref={editorColRef} className="flex min-h-0 flex-grow flex-col">
          <div style={{ height: `${100 - termPct}%` }} className="min-h-0 overflow-hidden">
            <EditorPanel
              language={language}
              value={viewing ? viewing.record.code : code}
              onChange={setCode}
              readOnly={editorReadOnly}
            />
          </div>
          <SplitHandle
            axis="y"
            containerRef={editorColRef}
            onPct={(pct) => setTermPct(100 - pct)}
            label="터미널 높이 조절"
            className="border-t border-white/10 bg-white/[0.02]"
          />
          <div style={{ height: `${termPct}%` }} className="min-h-0 overflow-hidden">
            <OutputPanel results={results} total={lastRunTotal} cases={problem.cases} />
          </div>
        </div>

        {/* Agent 코드 생성 연출 — 분석 → 작성(한 줄씩) → 완성된 코드 */}
        {codegen && (
          <AgentCodegen
            code={codegenCode}
            language={language}
            onDone={() => {
              if (pendingCode !== null) {
                setCode(pendingCode);
                setPendingCode(null);
              }
              setCodegen(false);
            }}
          />
        )}

        {/* 전체 통과 → 면접 전환 오버레이 */}
        {passedFlash && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
            <div className="space-y-3 text-center">
              <div className="text-5xl">🎯</div>
              <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                ALL TESTS PASSED
              </p>
              <p className="font-mono text-sm text-white/60">면접 모드로 전환합니다…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
