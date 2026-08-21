'use client';

// 문제 워크스페이스 — 랜딩 데모(EditorShowcase)와 동일한 크롬:
// 좌 #12141C 밑줄 탭 패널 · 우 검정 에디터 카드. 좌/우 패널과 에디터/터미널은
// 커스텀 스플리터로 크기를 조절할 수 있고, debateQ는 상단 토글로 켜고 끈다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import ReportButton from '@/app/components/report-button';
import remarkGfm from 'remark-gfm';
import { runJudge, disposeJudgeWorkers } from '@/app/lib/judge/client';
import {
  DIFFICULTY_LABELS,
  LANGUAGE_LABELS,
  type CaseResult,
  type JudgeRunResult,
  type Language,
  type StarterCodes,
} from '@/app/lib/types';
import { analyzeCode } from '@/app/lib/ai/mock-interviewer';
import { DEFAULT_CHAT_MODEL_ID, type DebateAiModelId } from '@/app/lib/ai/debateai-models';
import {
  SCAFFOLD_DESCRIPTIONS,
  SCAFFOLD_LABELS,
  SCAFFOLD_LEVELS,
  allowsAi,
  hardScaffold,
  scaffoldCodes,
  type ScaffoldLevel,
} from '@/app/lib/scaffold';
import {
  allowedLevels,
  allowedModes,
  clearLive,
  clearSetup,
  defaultSetup,
  isLiveInTab,
  markLive,
  readSetup,
  writeSetup,
  type RefactorMode,
  type SolveSetup,
  type WorkspaceMode,
} from '@/app/lib/solve-session';
import EditorPanel from './editor-panel';
import OutputPanel from './output-panel';
import InterviewPanel, { type InterviewMode } from './interview-panel';
import {
  DEFAULT_INTERVIEW_CONFIG,
  FOCUS_HINTS,
  FOCUS_LABELS,
  LEVEL_HINTS,
  LEVEL_LABELS,
  ROUND_CHOICES,
  type InterviewConfig,
  type InterviewFocus,
  type InterviewLevel,
} from '@/app/lib/ai/interview-config';
import DebateQPanel, { type DebateQSessionPayload } from './debateq-panel';
import DebateAiChat from './debateai-chat';
import AgentCodegen from './agent-codegen';
import AnalysisCta from './analysis-cta';
import OnboardingGuide, { WORKSPACE_TOUR, shouldAutoStart } from './onboarding-guide';
import { buildPromptSuggestions } from './prompt-suggestions';
import { SplitHandle, useSplitPct } from './split-pane';
import SegmentedControl from './segmented-control';
import CompletionPanel from './completion-panel';
import SolveSetupGate from './solve-setup';
import SolveResumePrompt from './solve-resume';
import SolveTimer from './solve-timer';
import { completionCta, requiresSetup, type ProblemEntryContext } from './entry-context';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

type SidebarTab = 'problem' | 'concepts' | 'attempts' | 'notes' | 'debate';

export interface WorkspaceProblem {
  id: number;
  title: string;
  difficulty: number;
  category: string;
  description: string;
  timeLimitMs: number;
  tags: string[];
  starterCodes: StarterCodes;
  cases: Array<{ id: number; args: unknown[]; expected: unknown; isHidden: boolean }>;
}

type Mode = 'SOLVING' | 'INTERVIEW';

// 시도횟수 탭 테이블 한 줄 — 서버(RunAttempt) 또는 이번 세션의 실행 기록
interface RunRecord {
  id: string;
  ts: number;
  code: string;
  language: Language;
  status: 'PASS' | 'FAIL' | 'ERROR' | 'TIMEOUT';
  passedCount: number;
  totalCount: number;
  kind: 'run' | 'submit';
}

interface MemoRecord {
  text: string;
  ts: number;
  /** 상단 고정 — 정렬 순서와 무관하게 항상 목록 맨 위에 남는다 */
  pinned?: boolean;
}

const DIFFICULTY_BADGE: Record<number, string> = {
  1: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  2: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  3: 'bg-brand-600/15 text-brand-300 border-brand-500/30',
  4: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

// 모드·난이도 타입은 게이트(SolveSetupGate)와 공유하므로 lib에서 가져오고,
// debateQ 패널을 위해 그대로 다시 내보낸다.
export type { RefactorMode, WorkspaceMode };

// 워크스페이스 모드 세그먼트 — 표시 순서: 시그니처 > 디베이트 > 리팩토링(구 debateQ).
// 실전 모의고사에서는 세그먼트 대신 잠긴 표시로 바뀐다(모드는 입장 전에 확정된다).
const MODE_SEGMENTS: Array<{ key: WorkspaceMode; labelKey: string }> = [
  { key: 'signature', labelKey: 'signature-mode' },
  { key: 'debate', labelKey: 'debate-mode' },
  { key: 'refactor', labelKey: 'refactor-mode' },
];

const MODE_LABEL_KEYS: Record<WorkspaceMode, string> = {
  signature: 'signature-mode',
  debate: 'debate-mode',
  refactor: 'refactor-mode',
};

// 리팩토링 모드의 세부 모드 — 난이도 세그먼트가 있던 자리를 그대로 쓴다.
//   copilot  AI가 만든 결함 코드를 AI 프롬프트로만 고친다(에디터 잠금)
//   editor   같은 결함 코드를 AI 없이 직접 고친다(에디터 개방)
const REFACTOR_SEGMENTS: Array<{ key: RefactorMode; label: string; title: string }> = [
  {
    key: 'copilot',
    label: 'Copilot',
    title: 'AI가 생성한 결함 코드를 AI 프롬프트로만 수정해 실행합니다 (에디터 직접 편집 불가)',
  },
  {
    key: 'editor',
    label: 'Editor',
    title: 'AI가 생성한 결함 코드를 AI 도움 없이 직접 수정합니다',
  },
];

const REFACTOR_LABELS: Record<RefactorMode, string> = { copilot: 'Copilot', editor: 'Editor' };

// Agent 모드 추천 — 질문이 아니라 "무엇을 어떻게 고쳐라"의 꼴이어야 한다
const AGENT_PROMPTS = [
  '지금 코드의 버그를 찾아서 고쳐줘',
  '시간 복잡도를 줄여줘',
  '엣지 케이스(빈 입력·중복 값)를 처리하도록 고쳐줘',
  '변수명을 의미가 드러나게 정리해줘',
  '주석을 달아 흐름을 설명해줘',
];

// 탭 순서: debateAI > 문제사항 > 문제분석 > 시도횟수 > 메모.
// debateAI가 맨 앞인 이유는 쓸 수 있을 때 가장 먼저 손이 가는 탭이기 때문이다.
// 다만 쓸 수 없는 난이도에서는 아예 목록에서 빠진다(아래 visibleTabs).
const TABS: Array<{ key: SidebarTab; labelKey: string; label: string; live?: boolean; accent?: boolean }> = [
  // accent — 나머지가 문서·기록 탭이라 눈에 띄지 않으면 AI를 쓸 수 있다는 것 자체를 모르고 지나친다
  { key: 'debate', labelKey: 'tab-debate', label: 'debateAI', live: true, accent: true },
  { key: 'problem', labelKey: 'tab-problem', label: '문제사항' },
  { key: 'concepts', labelKey: 'tab-concepts', label: '문제분석' },
  { key: 'attempts', labelKey: 'tab-attempts', label: '시도횟수' },
  { key: 'notes', labelKey: 'tab-notes', label: '메모' },
];

export default function Workspace({
  problem,
  isLoggedIn,
  entry,
  builtinLive,
  defaultChatModel = DEFAULT_CHAT_MODEL_ID,
  aiAccess = { hasOwnKey: false, hasLocalEndpoint: false },
}: {
  problem: WorkspaceProblem;
  isLoggedIn: boolean;
  entry: ProblemEntryContext;
  builtinLive: boolean;
  /** 설정에서 고른 면접·리팩토링 기본 모델 */
  defaultChatModel?: DebateAiModelId;
  /** BYOK/Local 모델을 쓸 수 있는지 판단할 재료 — 서버에서 내려준다 */
  aiAccess?: { hasOwnKey: boolean; hasLocalEndpoint: boolean };
}) {
  const { language: uiLang } = useLanguage();
  const [mode, setMode] = useState<Mode>('SOLVING');
  const [language, setLanguage] = useState<Language>('javascript');
  const [codeByLang, setCodeByLang] = useState<StarterCodes>(problem.starterCodes);
  const [results, setResults] = useState<CaseResult[]>([]);
  const [lastRunTotal, setLastRunTotal] = useState(0);
  const [judging, setJudging] = useState(false);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [interview, setInterview] = useState<{ sessionId: string; firstQuestion: string } | null>(null);
  const [passedFlash, setPassedFlash] = useState(false);
  // 정답 이후 화면 — Easy(코드 채우기)와 일반 제출이 공유한다
  const [completion, setCompletion] = useState<{ correct: boolean } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('problem');
  const [notes, setNotes] = useState('');
  const [memoHistory, setMemoHistory] = useState<MemoRecord[]>([]);
  // 시도 기록 — 로그인 시 서버(RunAttempt)에서 불러오고, 실행할 때마다 앞에 쌓인다
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [attemptTotal, setAttemptTotal] = useState(0);
  const [attemptPage, setAttemptPage] = useState(1);
  const [attemptOrder, setAttemptOrder] = useState<'latest' | 'oldest'>('latest');
  const [selectedAttemptIds, setSelectedAttemptIds] = useState<string[]>([]);
  const [attemptEditing, setAttemptEditing] = useState(false);
  const [memoOrder, setMemoOrder] = useState<'latest' | 'oldest'>('latest');
  const [memoEditing, setMemoEditing] = useState(false);
  const [selectedMemoTs, setSelectedMemoTs] = useState<number[]>([]);
  const [loadedAttemptId, setLoadedAttemptId] = useState<string | null>(null);
  // 실전 모의고사(mock 세트)로 들어왔는가 — 이때만 입장 전 게이트가 서고 조건이 잠긴다.
  // 문제집에서 연 개별 문제나 기출·테마 세트는 예전처럼 그 자리에서 모드·난이도를 바꾼다.
  const gated = requiresSetup(entry);

  // 풀이 설정 — 시간 규칙·모드·난이도가 한곳에 담긴다. 모의고사에서는 게이트가 채우고
  // 그 뒤로 잠기며, 그 외에는 상단 세그먼트로 계속 바꿀 수 있다.
  const [setup, setSetup] = useState<SolveSetup | null>(null);
  // 저장된 설정을 읽기 전(하이드레이션 직후)에는 게이트도 워크스페이스도 띄우지 않는다
  const [setupReady, setSetupReady] = useState(false);
  // 모의고사를 나갔다 다시 들어온 경우 — 이어서 풀지 새로 시작할지 먼저 묻는다
  const [resumePrompt, setResumePrompt] = useState<SolveSetup | null>(null);
  // 엄격모드 시간 종료 — 실행·제출이 막히고 종료 화면이 뜬다
  const [timeUp, setTimeUp] = useState(false);

  // 설정에서 읽어 오는 값들 — 상태가 아니라 파생값이라 출처가 하나로 유지된다.
  // (설정을 읽기 전에도 렌더는 돌아가므로 기본값을 둔다)
  const activeMode = setup?.mode ?? 'signature';
  const scaffoldLevel = setup?.level ?? 'normal';
  const refactorMode = setup?.refactorMode ?? 'copilot';
  const dqOn = activeMode === 'refactor';
  // 비로그인 이용자는 어느 경로로 들어오든 시그니처모드·보통 난이도만 쓸 수 있다
  const modeChoices = allowedModes(isLoggedIn);
  const levelChoices = allowedLevels(isLoggedIn);
  // 잠긴 debateAI 화면과 문제분석 CTA가 "쉬움으로 바꾸기"를 권해도 되는가
  const canSwitchToEasy = !gated && levelChoices.includes('easy');
  // 엄격모드 종료 — 시계가 0에 닿는 순간 한 번. 참조가 매 렌더 바뀌면 타이머가 다시 걸린다.
  const handleTimeUp = useCallback(() => setTimeUp(true), []);
  // debateAI 챗봇 — 선택 모델(쉬움 스캐폴드 생성에도 쓰인다) + 문제분석 CTA에서 넘어오는 질문 시드
  const [chatModel, setChatModel] = useState<DebateAiModelId>(defaultChatModel);
  const [chatSeed, setChatSeed] = useState<string>();
  // Agent가 만든 코드 — 애니메이션이 끝나면 에디터에 들어간다(그 전에는 미리 바뀌지 않는다)
  const [agentCode, setAgentCode] = useState<string | null>(null);
  // 면접 모드 선택 (전체 통과 후, 면접 시작 전)
  const [pendingInterview, setPendingInterview] = useState<{ sessionId: string; firstQuestion: string } | null>(null);
  const [interviewMode, setInterviewMode] = useState<InterviewMode>('basic');
  const [voiceMode, setVoiceMode] = useState(false);
  // 면접 질문 커스텀 — 문항 수·난이도·경향. 입장할 때 서버에 한 번 저장한다.
  const [interviewConfig, setInterviewConfig] = useState<InterviewConfig>(DEFAULT_INTERVIEW_CONFIG);
  const [enteringInterview, setEnteringInterview] = useState(false);

  // 온보딩 가이드 — 게이트를 통과한 뒤 최초 진입에서만 자동으로 뜬다
  // ("앞으로 보지 않기"를 체크했으면 영영 안 뜬다). localStorage 판단은 하이드레이션 뒤에만 가능하다.
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 하이드레이션 후에만 읽을 수 있다
    if (setup && shouldAutoStart()) setTourOpen(true);
  }, [setup]);

  // 리팩토링모드에서 쓰는 debateQ 세션 — 게이트에서 리팩토링을 고르면 불러온다
  const [dqLoading, setDqLoading] = useState(false);
  const [dqError, setDqError] = useState<string>();
  const [dqSession, setDqSession] = useState<DebateQSessionPayload | null>(null);

  // 커스텀 스플리터 — 좌 패널 너비(%) / 터미널 높이(%). localStorage에 저장된다.
  const rowRef = useRef<HTMLDivElement>(null);
  const editorColRef = useRef<HTMLDivElement>(null);
  const [leftPct, setLeftPct] = useSplitPct('dc:ws:split-x', 41, 24, 68);
  const [termPct, setTermPct] = useSplitPct('dc:ws:split-y', 30, 15, 70);

  const code = codeByLang[language];
  const setCode = useCallback(
    (v: string) => setCodeByLang((prev) => ({ ...prev, [language]: v })),
    [language],
  );
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => () => disposeJudgeWorkers(), []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(`debate-code:${problem.id}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        codeByLang?: StarterCodes;
        notes?: string;
        memoHistory?: MemoRecord[];
      };
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 복원은 하이드레이션 후에만 가능
      if (parsed.codeByLang) setCodeByLang((prev) => ({ ...prev, ...parsed.codeByLang! }));
      if (typeof parsed.notes === 'string') setNotes(parsed.notes);
      if (Array.isArray(parsed.memoHistory)) setMemoHistory(parsed.memoHistory);
    } catch {
      // ignore malformed cached state
    }
  }, [problem.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(`debate-code:${problem.id}`, JSON.stringify({ codeByLang, notes, memoHistory }));
  }, [codeByLang, notes, memoHistory, problem.id]);

  /**
   * 저장된 설정 복원.
   *
   * 모의고사에서는 새로고침해도 게이트가 다시 뜨지 않고 시계도 이어진다. 저장된 것이 없거나
   * 로그아웃 등으로 지금 쓸 수 없는 설정이면(readSetup이 null) 게이트가 다시 열린다.
   *
   * 모의고사가 아니면 게이트 없이 바로 풀이로 들어가야 하므로, 없을 때 기본 설정을 채운다.
   * 로그인 상태의 기본 모드는 예전과 같은 디베이트모드다.
   *
   * 진행 중인 모의고사를 나갔다 다시 연 것이라면(같은 탭에서 이어 보던 화면이 아니라면)
   * 곧장 이어 붙이지 않고 재진입 화면을 먼저 띄운다.
   */
  useEffect(() => {
    const saved = readSetup(problem.id, isLoggedIn);
    if (saved && gated && !isLiveInTab(problem.id, saved.startedAt)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage/sessionStorage는 하이드레이션 후에만 읽을 수 있다
      setResumePrompt(saved);
      setSetupReady(true);
      return;
    }
    setSetup(
      saved ??
        (gated ? null : { ...defaultSetup(), mode: isLoggedIn ? 'debate' : 'signature', startedAt: Date.now() }),
    );
    setSetupReady(true);
  }, [problem.id, isLoggedIn, gated]);

  // 이 탭에서 보고 있는 모의고사라는 표식 — 화면을 떠나면 지워지고, 새로고침에는 남는다.
  // 그 차이가 곧 "재진입인가 새로고침인가"의 판단 근거다(app/lib/solve-session.ts).
  useEffect(() => {
    if (!gated || !setup) return;
    markLive(problem.id, setup.startedAt);
    return () => clearLive(problem.id);
  }, [gated, setup, problem.id]);

  // 서버에 저장된 시도 기록 로드 (로그인 시)
  useEffect(() => {
    if (!isLoggedIn) return;
    fetch(`/api/attempts?problemId=${problem.id}&page=${attemptPage}&order=${attemptOrder === 'latest' ? 'latest' : 'oldest'}`)
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.attempts)) return;
        setAttemptTotal(typeof d.total === 'number' ? d.total : d.attempts.length);
        setRunHistory(
          d.attempts.map(
            (a: {
              id: string;
              createdAt: string;
              code: string;
              language: Language;
              status: RunRecord['status'];
              passedCount: number;
              totalCount: number;
              kind: RunRecord['kind'];
            }) => ({
              id: a.id,
              ts: new Date(a.createdAt).getTime(),
              code: a.code,
              language: a.language,
              status: a.status,
              passedCount: a.passedCount,
              totalCount: a.totalCount,
              kind: a.kind,
            }),
          ),
        );
      })
      .catch(() => {});
  }, [isLoggedIn, problem.id, attemptPage, attemptOrder]);

  // 실행 1회를 시도 기록에 남긴다 — 화면에 즉시 반영하고, 로그인 시 서버에도 저장
  function recordAttempt(result: JudgeRunResult, kind: 'run' | 'submit') {
    const rec: RunRecord = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      code: codeRef.current,
      language,
      status: result.status,
      passedCount: result.passed,
      totalCount: result.total,
      kind,
    };
    setRunHistory((prev) => [rec, ...prev].slice(0, 10));
    setAttemptTotal((prev) => prev + 1);
    if (isLoggedIn) {
      fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          code: rec.code,
          language: rec.language,
          status: rec.status,
          passedCount: rec.passedCount,
          totalCount: rec.totalCount,
          kind,
        }),
      }).catch(() => {});
    }
  }

  // 시도 기록 클릭 — 그때 작성한 코드를 에디터에 복원한다
  function loadAttempt(rec: RunRecord) {
    if (judging) return;
    const current = codeByLang[rec.language];
    if (
      rec.code !== current &&
      !window.confirm('선택한 기록의 코드를 에디터에 불러옵니다. 현재 코드는 덮어써집니다. 계속할까요?')
    ) {
      return;
    }
    setLanguage(rec.language);
    setCodeByLang((prev) => ({ ...prev, [rec.language]: rec.code }));
    setLoadedAttemptId(rec.id);
    setResults([]);
  }

  // 메모 저장 — 현재 입력을 기록 테이블 맨 앞에 쌓고 입력창을 비운다
  function saveMemo() {
    const text = notes.trim();
    if (!text) return;
    setMemoHistory((prev) => [{ text, ts: Date.now() }, ...prev].slice(0, 100));
    setNotes('');
  }

  /**
   * 게이트 통과 — 고른 설정을 확정하고 풀이를 시작한다.
   *
   * 난이도에 맞는 시작 코드를 **모든 언어에** 한 번에 깔아 둔다. 풀이 중에 언어를 바꿔도
   * 같은 난이도에서 출발해야 하기 때문이다(어려움으로 시작해 언어만 바꿔 스타터를 받아
   * 가는 구멍을 막는다). 확정 시각을 함께 저장해 새로고침해도 시계가 이어진다.
   */
  function startSolving(next: SolveSetup) {
    setCodeByLang(scaffoldCodes(next.level, problem.starterCodes));
    setResults([]);
    setTimeUp(false);
    // AI가 잠기는 난이도로 들어가면 debateAI 탭에 머물러 있을 이유가 없다
    setSidebarTab(allowsAi(next.level) ? 'debate' : 'problem');
    setSetup(next);
    writeSetup(problem.id, next);
  }

  /** 설정 일부만 갈아 끼운다 — 모의고사가 아닐 때 상단 세그먼트가 쓰는 통로 */
  function patchSetup(patch: Partial<SolveSetup>) {
    setSetup((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      writeSetup(problem.id, next);
      return next;
    });
  }

  /**
   * 시작 코드 난이도 전환 — 현재 언어의 코드를 해당 스캐폴드로 교체한다.
   * (모의고사에서는 난이도가 입장 전에 확정되므로 이 경로 자체가 열리지 않는다)
   *
   * 쉬움과 보통은 **같은 시작 코드**(상수가 정의된 스타터)에서 출발한다.
   * 둘을 가르는 것은 코드가 아니라 debateAI를 쓸 수 있는지 여부다(allowsAi).
   * 어려움만 빈 코드로 시작한다.
   */
  function applyScaffold(level: ScaffoldLevel) {
    if (gated || level === scaffoldLevel || !levelChoices.includes(level)) return;

    const nextCode = level === 'hard' ? hardScaffold(language) : problem.starterCodes[language];
    // 손댄 코드가 있을 때만 확인을 받는다 — 시작 코드 그대로면 물을 이유가 없다
    const dirty = code.trim() !== problem.starterCodes[language].trim() && code.trim() !== hardScaffold(language).trim();
    if (
      dirty &&
      code.trim() !== nextCode.trim() &&
      !window.confirm('시작 코드 난이도를 바꾸면 현재 언어의 코드가 교체됩니다. 계속할까요?')
    ) {
      return;
    }

    patchSetup({ level });
    setResults([]);
    setCode(nextCode);

    // AI가 잠기는 난이도로 내려가면 debateAI 탭에 머물러 있을 이유가 없다
    if (!allowsAi(level) && sidebarTab === 'debate') setSidebarTab('problem');
  }

  /** 모드 전환 — 모의고사가 아닐 때만. 세 모드는 상호 배타다. */
  function selectMode(next: WorkspaceMode) {
    if (gated || next === activeMode || !modeChoices.includes(next)) return;
    patchSetup({ mode: next });
    if (next === 'signature') setSidebarTab('problem');
    // 리팩토링으로 넘어가면 debateQ 세션은 아래 effect가 불러온다(이미 있으면 그대로 재사용)
  }

  /**
   * 설정 다시 하기 — 모의고사에서는 게이트로 되돌아간다(시계도 코드도 처음부터).
   * 풀이 도중에는 열리지 않고, 시간이 다 됐거나 세션을 열지 못했을 때만 부를 수 있다.
   *
   * 모의고사가 아니면 되돌아갈 게이트가 없으므로, 막힌 리팩토링모드에서 빠져나오도록
   * 시그니처모드로 되돌리는 것으로 대신한다.
   */
  function restartSolving() {
    setTimeUp(false);
    setCompletion(null);
    setResults([]);
    setDqError(undefined);
    if (!gated) {
      patchSetup({ mode: 'signature' });
      setSidebarTab('problem');
      return;
    }
    clearSetup(problem.id);
    setSetup(null);
    setCodeByLang(problem.starterCodes);
  }

  /**
   * Agent(또는 답변 속 코드 블록)가 만든 코드를 에디터로 옮긴다.
   *
   * Agent 모드는 이용자가 "고쳐 줘"라고 시킨 결과라 그대로 진행하고,
   * 답변 블록의 [에디터로]는 한 번 클릭이라 손대던 코드가 있으면 확인을 받는다.
   * 실제 반영은 생성 애니메이션이 끝날 때 일어난다(applyAgentCode → AgentCodegen.onDone).
   */
  function applyAgentCode(next: string, source: 'agent' | 'block') {
    if (source === 'block') {
      const dirty = code.trim() && code.trim() !== problem.starterCodes[language].trim();
      if (dirty && !window.confirm('이 코드를 에디터로 옮기면 지금 작성한 코드가 덮어써집니다. 계속할까요?')) return;
    }
    setAgentCode(next);
  }

  const execute = useCallback(
    async (allCases: boolean) => {
      const cases = allCases ? problem.cases : problem.cases.filter((c) => !c.isHidden);
      setJudging(true);
      setResults([]);
      setLastRunTotal(cases.length);
      setBanner(null);
      try {
        return await runJudge({
          language,
          code: codeRef.current,
          cases,
          timeLimitMs: problem.timeLimitMs,
          onRuntimeLoading: setRuntimeLoading,
          onCaseResult: (r) => setResults((prev) => [...prev, r]),
        });
      } finally {
        setJudging(false);
      }
    },
    [language, problem.cases, problem.timeLimitMs],
  );

  async function handleRun() {
    if (timeUp) return;
    const result = await execute(false);
    if (result) recordAttempt(result, 'run');
  }

  async function handleSubmit() {
    if (timeUp) return;
    if (!isLoggedIn) {
      setBanner(t('submit-login-required', uiLang));
      return;
    }
    const result = await execute(true);
    if (!result) return;
    recordAttempt(result, 'submit');

    setSubmitting(true);
    try {
      const res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemId: problem.id,
          code: codeRef.current,
          language,
          status: result.status,
          passedCount: result.passed,
          totalCount: result.total,
          runtimeMs: result.maxTimeMs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBanner(data.error ?? t('submit-failed', uiLang));
        return;
      }
      if (result.status === 'PASS' && activeMode === 'signature') {
        // 시그니처모드는 학습 흐름 — AI 분석 화면 대신 완료 카드를 띄운다
        setCompletion({ correct: true });
      } else if (result.status === 'PASS' && data.interviewSessionId) {
        // 전체 통과 → 면접 모드 선택 화면으로
        setPassedFlash(true);
        setTimeout(() => {
          setPassedFlash(false);
          setPendingInterview({ sessionId: data.interviewSessionId, firstQuestion: data.firstQuestion });
        }, 1400);
      } else if (result.status !== 'PASS') {
        setBanner(`${result.passed}/${result.total} ${t('submit-partial', uiLang)}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * 면접장 입장 — 고른 설정을 먼저 저장한다.
   *
   * 첫 질문은 제출 시점에 이미 만들어져 있어 설정을 반영하지 못한다. 서버가 저장과 함께
   * 첫 질문을 다시 만들어 주면 그것으로 시작한다(실패하면 원래 질문으로 들어간다 —
   * 설정 저장이 안 됐다고 면접 자체를 막을 이유는 없다).
   */
  async function enterInterview() {
    if (!pendingInterview || enteringInterview) return;
    setEnteringInterview(true);
    let firstQuestion = pendingInterview.firstQuestion;
    try {
      const res = await fetch(`/api/interview/${pendingInterview.sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(interviewConfig),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.firstQuestion === 'string') firstQuestion = data.firstQuestion;
    } catch {
      // 네트워크 실패 — 원래 첫 질문으로 진행한다
    }
    setInterview({ sessionId: pendingInterview.sessionId, firstQuestion });
    setPendingInterview(null);
    setMode('INTERVIEW');
    setEnteringInterview(false);
  }

  /** 리팩토링모드 진입 — 이 문제의 debateQ 세션(재개 또는 생성)을 불러온다 */
  async function openDebateQ() {
    if (dqSession) return; // 이미 불러온 세션 — 패널 상태가 그대로 유지된다
    setDqLoading(true);
    setDqError(undefined);
    try {
      const res = await fetch('/api/debateq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problemId: problem.id, language }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t('debateq-open-failed', uiLang));
      setDqSession(data as DebateQSessionPayload);
    } catch (e) {
      setDqError(e instanceof Error ? e.message : t('debateq-open-failed', uiLang));
    } finally {
      setDqLoading(false);
    }
  }

  // 리팩토링모드는 서버 세션(결함 코드)이 있어야 패널을 그린다. 게이트에서 방금 고른 경우도,
  // 저장된 설정으로 새로고침해 돌아온 경우도 여기서 한 번 불러온다.
  useEffect(() => {
    if (setup?.mode !== 'refactor' || dqSession || dqLoading || dqError) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 서버에 세션을 만드는 외부 동기화다. 진행 표시(dqLoading)가 켜지는 것이 그 시작이다
    void openDebateQ();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openDebateQ는 매 렌더 새로 만들어지므로 의존성에 넣을 수 없다
  }, [setup?.mode, dqSession, dqLoading, dqError]);

  const allAttemptsSelected = runHistory.length > 0 && selectedAttemptIds.length === runHistory.length;

  // 메모 목록 — 고정된 메모가 항상 먼저 오고, 그룹 안에서만 정렬 순서를 적용한다
  const orderedMemos = [...memoHistory].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return memoOrder === 'latest' ? b.ts - a.ts : a.ts - b.ts;
  });
  const allMemosSelected = orderedMemos.length > 0 && selectedMemoTs.length === orderedMemos.length;

  function toggleMemoPin(ts: number) {
    setMemoHistory((prev) => prev.map((m) => (m.ts === ts ? { ...m, pinned: !m.pinned } : m)));
  }

  function deleteSelectedMemos() {
    if (selectedMemoTs.length === 0) return;
    setMemoHistory((prev) => prev.filter((m) => !selectedMemoTs.includes(m.ts)));
    setSelectedMemoTs([]);
  }

  const attemptCount = isLoggedIn ? attemptTotal : runHistory.length;

  // debateAI 탭은 쓸 수 있을 때만 목록에 둔다 — 잠긴 탭을 눌러 보게 두지 않는다.
  // (리팩토링모드는 DebateQPanel이 자체 탭을 그리므로 여기 목록과 무관하다.)
  const aiTabVisible = allowsAi(scaffoldLevel);
  const visibleTabs = aiTabVisible ? TABS : TABS.filter((tab) => tab.key !== 'debate');

  // 추천 프롬프트 — 문제(카테고리·태그·난이도)와 지금 상태(코드 유무·실패 수·모드)로 만든다
  const failedCount = results.length > 0 ? results.filter((r) => r.status !== 'pass').length : null;
  const promptSuggestions = useMemo(
    () =>
      buildPromptSuggestions({
        category: problem.category,
        tags: problem.tags,
        difficulty: problem.difficulty,
        hasCode: code.trim().length > 0 && code.trim() !== problem.starterCodes[language].trim(),
        failedCount,
        level: scaffoldLevel,
        started: false,
        mode: activeMode,
      }),
    [problem.category, problem.tags, problem.difficulty, code, language, problem.starterCodes, failedCount, scaffoldLevel, activeMode],
  );

  async function deleteAttempts(all = false) {
    const ids = selectedAttemptIds;
    if (!all && ids.length === 0) return;
    if (!window.confirm(all ? '이 문제의 모든 시도 기록을 삭제할까요?' : `${ids.length}개의 시도 기록을 삭제할까요?`)) return;
    const res = await fetch('/api/attempts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problemId: problem.id, ids, all }) });
    if (!res.ok) return;
    setSelectedAttemptIds([]);
    setAttemptPage(1);
    const data = await res.json() as { deleted: number };
    setAttemptTotal((prev) => Math.max(0, prev - data.deleted));
    if (!all) setRunHistory((prev) => prev.filter((item) => !ids.includes(item.id))); else setRunHistory([]);
  }

  // 저장된 설정을 읽기 전에는 아무것도 그리지 않는다 — 게이트가 한 프레임 깜빡이지 않도록.
  if (!setupReady) return <div className="flex-grow bg-ink" />;

  // 진행 중이던 모의고사로 돌아왔다 — 이어서 풀지 새로 시작할지부터 고른다
  if (resumePrompt) {
    return (
      <div className="flex min-h-0 flex-grow flex-col">
        <SolveResumePrompt
          problemTitle={problem.title}
          setup={resumePrompt}
          onResume={() => {
            setSetup(resumePrompt);
            setResumePrompt(null);
          }}
          onRestart={() => {
            clearSetup(problem.id);
            clearLive(problem.id);
            setResumePrompt(null);
            setSetup(null);
            setCodeByLang(problem.starterCodes);
            setResults([]);
            setTimeUp(false);
          }}
        />
      </div>
    );
  }

  // 게이트 통과 전 — 조건을 정하기 전에는 문제 화면 자체를 열지 않는다
  if (!setup) {
    return (
      <div className="flex min-h-0 flex-grow flex-col">
        <SolveSetupGate
          problemTitle={problem.title}
          backHref={entry.returnPath}
          isLoggedIn={isLoggedIn}
          onStart={startSolving}
        />
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col min-h-0">
      {/* 최초 진입 온보딩 — 화면의 실제 요소를 비추며 탭·모드·실행·제출·면접을 순서대로 설명한다 */}
      {tourOpen && <OnboardingGuide steps={WORKSPACE_TOUR} onClose={() => setTourOpen(false)} />}
      {/* ---------- 상단 스트립: 문제 정보 + 난이도/모드 컨트롤 ----------
           스크롤해도 컨트롤이 따라오도록 sticky. 워크스페이스는 자체 스크롤 컨테이너를
           쓰므로 top-0으로 붙여도 사이트 헤더와 겹치지 않는다. */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#0B0D12]/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-[#0B0D12]/80">
        <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${DIFFICULTY_BADGE[problem.difficulty]}`}>
          {DIFFICULTY_LABELS[problem.difficulty]}
        </span>
        {/* 제목을 누르면 왔던 곳(문제집 또는 세트)으로 돌아간다 */}
        <h1 className="min-w-0 truncate font-semibold">
          <Link
            href={entry.returnPath}
            title={
              entry.source === 'SET' && entry.setTitle
                ? `${entry.setTitle}(으)로 돌아가기`
                : '문제집으로 돌아가기'
            }
            className="rounded transition-colors hover:text-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
          >
            {problem.title}
          </Link>
        </h1>
        <span className="font-mono text-[11px] text-fg-on-dark-quiet">{problem.category}</span>

        {/* 문제·에디터 신고 — 지문이나 채점이 잘못됐을 때 이용자가 그 자리에서 알릴 수 있어야 한다.
            문의로 흘려보내면 어느 문제였는지부터 다시 물어야 한다. */}
        <ReportButton
          targetType="problem"
          targetId={String(problem.id)}
          variant="icon"
          label="문제 오류 신고"
          autoContext={[
            `문제 #${problem.id} ${problem.title}`,
            `난이도 ${problem.difficulty} · ${problem.category}`,
            `언어 ${language}`,
            '',
            '--- 작성 중인 코드 ---',
            code.slice(0, 2000),
          ].join('\n')}
          className="dc-tap grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/15 text-fg-on-dark-quiet transition-colors hover:border-rose-400/50 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
        />
        {/* 가이드 다시 보기 — "앞으로 보지 않기"로 껐어도 여기서 언제든 다시 열 수 있다 */}
        <button
          type="button"
          onClick={() => setTourOpen(true)}
          aria-label="사용 가이드 다시 보기"
          title="사용 가이드 다시 보기"
          className="dc-tap grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/20 text-[10px] font-bold text-fg-on-dark-quiet transition-colors hover:border-brand-400 hover:text-brand-300"
        >
          ?
        </button>
        {mode === 'INTERVIEW' && (
          <span className="font-mono text-[10px] text-brand-300 tracking-wider border border-signal/30 bg-signal/10 rounded-full px-2.5 py-1">
            DEBATE MODE
          </span>
        )}
        {/* 실전 모의고사 — 조건은 입장 전에 확정됐다. 컨트롤이 아니라 잠긴 표시로 두고,
            그 왼쪽에 풀이 시계를 놓는다(자유=경과 스톱워치, 엄격=남은 시간 카운트다운). */}
        {mode === 'SOLVING' && gated && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SolveTimer setup={setup} stopped={timeUp || !!completion} onTimeUp={handleTimeUp} />
            <div
              title={t('setup-locked-hint', uiLang)}
              className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-fg-on-dark"
            >
              <span aria-hidden className="text-fg-on-dark-quiet">🔒</span>
              <span data-tour="mode">{t(MODE_LABEL_KEYS[activeMode], uiLang)}</span>
              <span aria-hidden className="h-4 w-px shrink-0 bg-white/15" />
              {/* 리팩토링은 AI가 준 결함 코드에서 출발해 시작 코드 난이도 개념이 없다 */}
              <span
                data-tour="scaffold"
                title={activeMode === 'refactor' ? undefined : SCAFFOLD_DESCRIPTIONS[scaffoldLevel]}
              >
                {activeMode === 'refactor' ? REFACTOR_LABELS[refactorMode] : SCAFFOLD_LABELS[scaffoldLevel]}
              </span>
            </div>
          </div>
        )}

        {/* 그 외(문제집 개별 문제·기출·테마 세트) — 난이도 + 모드 통합 컨트롤.
            하나의 테두리/배경 안에서 구분선으로만 나눈다. 리팩토링 모드는 AI가 준 결함 코드를
            다루므로 시작 코드 난이도 개념이 없어 난이도 칸을 접는다. */}
        {mode === 'SOLVING' && !gated && (
          <div className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-white/15 bg-white/5 p-0.5 text-[11px] font-semibold">
            <span data-tour="scaffold" className="flex items-center">
              {activeMode === 'refactor' ? (
                <SegmentedControl
                  ariaLabel="리팩토링 세부 모드"
                  value={refactorMode}
                  onChange={(next) => patchSetup({ refactorMode: next })}
                  options={REFACTOR_SEGMENTS}
                />
              ) : (
                <SegmentedControl
                  ariaLabel={t('scaffold-level', uiLang)}
                  value={scaffoldLevel}
                  onChange={applyScaffold}
                  options={SCAFFOLD_LEVELS.map((l) => {
                    const locked = !levelChoices.includes(l);
                    return {
                      key: l,
                      label: SCAFFOLD_LABELS[l],
                      title: locked ? t('setup-login-required', uiLang) : SCAFFOLD_DESCRIPTIONS[l],
                      disabled: locked,
                      suffix: locked ? <span className="ml-1 text-[9px]">🔒</span> : null,
                    };
                  })}
                />
              )}
            </span>

            <span aria-hidden className="h-4 w-px shrink-0 bg-white/15" />

            {/* 모드 토글은 비로그인 상태에서도 보여 준다 — 어떤 모드가 있는지조차 모르게 두지 않는다.
                다만 고를 수 있는 것은 시그니처모드뿐이라 나머지는 자물쇠와 함께 잠긴다. */}
            <span data-tour="mode" className="flex items-center">
              <SegmentedControl
                ariaLabel={t('workspace-mode', uiLang)}
                value={activeMode}
                onChange={selectMode}
                options={MODE_SEGMENTS.map((segment) => {
                  const locked = !modeChoices.includes(segment.key);
                  const loading = segment.key === 'refactor' && dqLoading;
                  return {
                    key: segment.key,
                    label: t(segment.labelKey, uiLang),
                    title: locked ? t('setup-login-required', uiLang) : undefined,
                    disabled: locked || loading,
                    suffix: loading ? (
                      <span className="ml-1 font-mono text-[9px]">…</span>
                    ) : locked ? (
                      <span className="ml-1 text-[9px]">🔒</span>
                    ) : null,
                  };
                })}
              />
            </span>
          </div>
        )}
      </div>
      {/* 리팩토링 세션을 열지 못하면 이 모드로는 아무것도 할 수 없다 —
          갇히지 않도록 설정을 다시 고를 길을 배너 안에 둔다 */}
      {dqError && (
        <div className="flex items-center gap-3 border-b border-rose-500/20 bg-rose-500/10 px-5 py-2 text-xs text-rose-300">
          {dqError}
          <button
            type="button"
            onClick={restartSolving}
            className="rounded border border-rose-400/40 px-2 py-0.5 font-semibold text-rose-200 transition-colors hover:border-rose-400/70"
          >
            {gated ? t('setup-restart', uiLang) : t('signature-mode', uiLang)}
          </button>
        </div>
      )}

      {/* ---------- debateQ 패널 (토글 ON) — 상태 유지를 위해 숨김 처리로 전환 ---------- */}
      {dqSession && (
        <div className={dqOn ? 'flex-grow flex flex-col min-h-0' : 'hidden'}>
          <DebateQPanel
            key={dqSession.sessionId}
            session={dqSession}
            problem={problem}
            builtinLive={builtinLive}
            onSessionChange={setDqSession}
            chatModel={chatModel}
            onChatModelChange={setChatModel}
            refactorMode={refactorMode}
            aiAccess={aiAccess}
          />
        </div>
      )}

      {/* ---------- 일반 워크스페이스 (토글 OFF) — 좌/우 스플리터 ---------- */}
      <div
        ref={rowRef}
        className={
          dqOn && dqSession
            ? 'hidden'
            : 'flex-grow flex flex-col lg:flex-row gap-3 lg:gap-0 p-3 min-h-0 bg-white/[0.03]'
        }
      >
        {/* 좌: 밑줄 탭 패널 (데모와 동일한 크롬) */}
        <div
          style={{ '--left-w': `${leftPct}%` } as React.CSSProperties}
          className="flex min-h-[320px] w-full lg:min-h-0 lg:w-[var(--left-w)] lg:shrink-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#12141C]"
        >
          {mode === 'SOLVING' ? (
            <>
              {/* 탭 내비게이션 — 스크롤은 가능하지만 스크롤바는 표시하지 않는다 */}
              <div
                data-tour="tabs"
                className="dc-scroll-none flex items-center overflow-x-auto border-b border-white/10 text-[11px] font-medium text-fg-on-dark-quiet"
                role="tablist"
              >
                {/* debateAI 탭은 시그니처·디베이트 모드 모두에 있다.
                    쓸 수 있는지는 모드가 아니라 난이도(쉬움)가 정한다. */}
                {visibleTabs.map((tab) => (
                  <button
                    key={tab.key}
                    role="tab"
                    data-tour={tab.key === 'debate' ? 'debate-tab' : undefined}
                    aria-selected={sidebarTab === tab.key}
                    onClick={() => setSidebarTab(tab.key)}
                    className={`flex items-center gap-1 whitespace-nowrap px-3 py-2.5 transition-colors ${
                      sidebarTab === tab.key
                        ? 'border-b-2 border-brand-400 font-bold text-brand-400'
                        : tab.accent
                          ? 'font-semibold text-brand-300/80 hover:text-brand-200'
                          : 'hover:text-fg-on-dark-secondary'
                    }`}
                  >
                    {tab.accent && (
                      <span
                        aria-hidden
                        className="mr-0.5 h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(69,49,217,0.9)] motion-safe:animate-pulse"
                      />
                    )}
                    {t(tab.labelKey, uiLang)}
                    {tab.live && !tab.accent && (
                      <span className="h-1 w-1 rounded-full bg-brand-500 animate-pulse motion-reduce:animate-none" />
                    )}
                  </button>
                ))}
              </div>

              {/* debateAI 챗봇 — 대화 유지를 위해 탭 전환 시에도 마운트를 유지한다 */}
              <div className={sidebarTab === 'debate' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                <DebateAiChat
                  problemId={problem.id}
                  language={language}
                  getCode={() => codeRef.current}
                  enabled={allowsAi(scaffoldLevel)}
                  // 난이도를 바꿀 수 있는 경로에서만 전환 버튼을 준다
                  onRequestEasy={canSwitchToEasy ? () => applyScaffold('easy') : undefined}
                  mode="general"
                  model={chatModel}
                  onModelChange={setChatModel}
                  seed={chatSeed}
                  suggestions={promptSuggestions}
                  commandSuggestions={AGENT_PROMPTS}
                  onApplyCode={applyAgentCode}
                  access={aiAccess}
                />
              </div>

              {sidebarTab !== 'debate' && (
                <div className="flex-grow overflow-y-auto dc-scroll px-5 py-4">
                  {sidebarTab === 'problem' && (
                    <>
                      <article className="prose-invert max-w-none text-[15px] leading-relaxed [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-brand-300 [&_h2:first-child]:mt-0 [&_p]:my-2.5 [&_p]:text-fg-on-dark [&_li]:text-fg-on-dark [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-white/5 [&_pre]:border [&_pre]:border-white/10 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:w-full [&_table]:my-3 [&_th]:text-left [&_th]:font-mono [&_th]:text-xs [&_th]:text-fg-on-dark-muted [&_th]:border-b [&_th]:border-white/15 [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-white/5 [&_td]:text-fg-on-dark">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{problem.description}</ReactMarkdown>
                      </article>
                      <div className="mt-6 flex flex-wrap gap-2">
                        {problem.tags.map((t) => (
                          <span key={t} className="font-mono text-[11px] text-fg-on-dark-quiet bg-white/5 border border-white/10 rounded-full px-2.5 py-1">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {/* 시도횟수 — 실행 시각·코드·성공 여부 테이블. 행을 누르면 그 코드가 에디터에 복원된다 */}
                  {sidebarTab === 'attempts' && (
                    <div className="space-y-3">
                      <div className="flex items-baseline justify-between">
                        <p className="font-bold text-white text-sm">시도 기록 ({attemptCount}회)</p>
                        {!isLoggedIn && (
                          <span className="text-[10px] text-fg-on-dark-quiet">로그인하면 기록이 저장됩니다</span>
                        )}
                      </div>
                      {/* 컨트롤 바 — 정렬은 왼쪽 끝, 편집(또는 편집 중 버튼셋)은 오른쪽 끝에 붙고
                          사이 공간은 justify-between으로 균등하게 벌어진다 */}
                      {isLoggedIn && (
                        <div className="flex items-center justify-between gap-2">
                          <select
                            value={attemptOrder}
                            onChange={(e) => { setAttemptOrder(e.target.value as 'latest' | 'oldest'); setAttemptPage(1); }}
                            aria-label={t('sort-order', uiLang)}
                            className="rounded border border-white/15 bg-ink px-2 py-1 text-[11px] text-fg-on-dark"
                          >
                            <option value="latest">{t('sort-latest', uiLang)}</option>
                            <option value="oldest">{t('sort-oldest', uiLang)}</option>
                          </select>

                          {attemptEditing ? (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedAttemptIds(allAttemptsSelected ? [] : runHistory.map((r) => r.id))}
                                disabled={runHistory.length === 0}
                                className="rounded border border-white/15 px-2 py-1 text-[11px] text-fg-on-dark-secondary transition-colors hover:border-white/35 hover:text-white disabled:opacity-30"
                              >
                                {t(allAttemptsSelected ? 'deselect-all' : 'select-all', uiLang)}
                              </button>
                              <button
                                onClick={() => deleteAttempts(false)}
                                disabled={selectedAttemptIds.length === 0}
                                className="rounded border border-rose-400/30 px-2 py-1 text-[11px] text-rose-300 transition-colors hover:border-rose-400/60 disabled:opacity-30"
                              >
                                {t('delete', uiLang)}
                                {selectedAttemptIds.length > 0 && ` ${selectedAttemptIds.length}`}
                              </button>
                              <button
                                onClick={() => { setAttemptEditing(false); setSelectedAttemptIds([]); }}
                                className="rounded bg-signal px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600"
                              >
                                {t('save', uiLang)}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAttemptEditing(true)}
                              disabled={runHistory.length === 0}
                              className="rounded border border-white/15 px-2.5 py-1 text-[11px] text-fg-on-dark-secondary transition-colors hover:border-white/35 hover:text-white disabled:opacity-30"
                            >
                              {t('edit', uiLang)}
                            </button>
                          )}
                        </div>
                      )}
                      {runHistory.length === 0 ? (
                        <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-6 text-center text-xs text-fg-on-dark-quiet">
                          아직 실행 기록이 없습니다. ▶ 실행 또는 제출을 하면 여기에 쌓입니다.
                        </p>
                      ) : (
                        <div className="overflow-hidden rounded-lg border border-white/10">
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead>
                              <tr className="border-b border-white/10 bg-white/[0.03] text-fg-on-dark-quiet">
                                {isLoggedIn && attemptEditing && (
                                  <th className="w-8 px-2 py-2">
                                    <input
                                      type="checkbox"
                                      aria-label={t('select-all', uiLang)}
                                      checked={allAttemptsSelected}
                                      onChange={(e) => setSelectedAttemptIds(e.target.checked ? runHistory.map((r) => r.id) : [])}
                                    />
                                  </th>
                                )}
                                <th className="px-3 py-2 font-medium">{t('run-time', uiLang)}</th>
                                <th className="px-3 py-2 font-medium">{t('code', uiLang)}</th>
                                <th className="px-3 py-2 font-medium text-right">{t('result', uiLang)}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {runHistory.map((rec) => {
                                const pass = rec.status === 'PASS';
                                const firstLine = rec.code.split('\n').find((l) => l.trim()) ?? '';
                                return (
                                  <tr
                                    key={rec.id}
                                    onClick={() => {
                                      // 편집 중에는 행 전체가 선택 토글로 동작한다 (코드 복원은 잠시 비활성)
                                      if (attemptEditing) {
                                        setSelectedAttemptIds((prev) =>
                                          prev.includes(rec.id) ? prev.filter((id) => id !== rec.id) : [...prev, rec.id],
                                        );
                                        return;
                                      }
                                      loadAttempt(rec);
                                    }}
                                    title={attemptEditing ? t('select-toggle-hint', uiLang) : t('attempt-load-hint', uiLang)}
                                    className={`cursor-pointer border-b border-white/5 transition-colors last:border-b-0 ${
                                      attemptEditing && selectedAttemptIds.includes(rec.id)
                                        ? 'bg-signal/15'
                                        : loadedAttemptId === rec.id
                                          ? 'bg-brand-500/10'
                                          : 'hover:bg-white/5'
                                    }`}
                                  >
                                    {isLoggedIn && attemptEditing && (
                                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={selectedAttemptIds.includes(rec.id)}
                                          onChange={(e) => setSelectedAttemptIds((prev) => (e.target.checked ? [...prev, rec.id] : prev.filter((id) => id !== rec.id)))}
                                        />
                                      </td>
                                    )}
                                    <td className="whitespace-nowrap px-3 py-2 text-fg-on-dark-secondary">
                                      {new Date(rec.ts).toLocaleString('ko-KR', {
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                      {rec.kind === 'submit' && <span className="ml-1 text-brand-300">{t('submit-label', uiLang)}</span>}
                                    </td>
                                    <td className="max-w-0 truncate px-3 py-2 text-fg-on-dark-quiet">{firstLine}</td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right">
                                      <span
                                        className={`rounded-full border px-2 py-0.5 text-[10px] ${
                                          pass
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                            : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                        }`}
                                      >
                                        {pass ? t('pass', uiLang) : t('fail', uiLang)} {rec.passedCount}/{rec.totalCount}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {isLoggedIn && attemptCount > 10 && <div className="flex items-center justify-end gap-2 text-xs"><button disabled={attemptPage === 1} onClick={() => setAttemptPage((p) => p - 1)} className="rounded border border-white/15 px-2 py-1 disabled:opacity-30">이전</button><span>{attemptPage} / {Math.ceil(attemptCount / 10)}</span><button disabled={attemptPage >= Math.ceil(attemptCount / 10)} onClick={() => setAttemptPage((p) => p + 1)} className="rounded border border-white/15 px-2 py-1 disabled:opacity-30">다음</button></div>}
                      {loadedAttemptId && (
                        <p className="text-[10px] text-brand-300/80">
                          {t('attempt-loaded', uiLang)}
                        </p>
                      )}
                    </div>
                  )}

                  {sidebarTab === 'concepts' && (() => {
                    const a = analyzeCode(code, language);
                    return (
                      <div className="space-y-4">
                        {/* 문제가 이해안된다면? — 난이도마다 할 수 있는 일이 달라 CTA도 갈린다.
                            쉬움은 바로 물어보고, 보통·어려움은 "난이도를 낮출 것인지"를 먼저 묻는다.
                            난이도를 바꿀 수 없는 자리(모의고사·비로그인)에서는 낮추기를 권하지 않는다. */}
                        <AnalysisCta
                          level={scaffoldLevel}
                          onAsk={(seed) => {
                            setChatSeed(seed);
                            setSidebarTab('debate');
                          }}
                          onSwitchToEasy={
                            canSwitchToEasy
                              ? () => {
                                  applyScaffold('easy');
                                  setChatSeed('이 문제가 잘 이해되지 않아요. 문제를 더 쉽게 다시 설명해 주세요.');
                                  setSidebarTab('debate');
                                }
                              : undefined
                          }
                        />
                        <div>
                          <p className="font-bold text-white text-sm mb-2">{t('problem-info', uiLang)}</p>
                          <div className="space-y-1.5 font-mono text-[11px]">
                            {(
                              [
                                [t('category', uiLang), problem.category],
                                [t('difficulty', uiLang), DIFFICULTY_LABELS[problem.difficulty]],
                                [t('time-limit', uiLang), `${t('per-case', uiLang)} ${problem.timeLimitMs / 1000}${t('seconds', uiLang)}`],
                              ] as const
                            ).map(([k, v]) => (
                              <p key={k} className="flex justify-between">
                                <span className="text-fg-on-dark-quiet">{k}</span>
                                <span className="text-fg-on-dark-secondary">{v}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm mb-2">{t('live-code-analysis', uiLang)}</p>
                          <div className="space-y-1.5 font-mono text-[11px]">
                            <p className="flex justify-between">
                              <span className="text-fg-on-dark-quiet">{t('time-complexity', uiLang)}</span>
                              <span className={a.hasNestedLoops ? 'text-rose-400' : 'text-emerald-400'}>{a.complexityGuess}</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-fg-on-dark-quiet">{t('nested-loops', uiLang)}</span>
                              <span className={a.hasNestedLoops ? 'text-rose-400' : 'text-emerald-400'}>
                                {a.hasNestedLoops ? `${a.maxLoopDepth}${t('depth-detected', uiLang)}` : t('none', uiLang)}
                              </span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-fg-on-dark-quiet">{t('recursion', uiLang)}</span>
                              <span className="text-fg-on-dark-secondary">{a.usesRecursion ? t('detected', uiLang) : t('none', uiLang)}</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-fg-on-dark-quiet">{t('structures-detected', uiLang)}</span>
                              <span className="text-fg-on-dark-secondary">{a.structures.length ? a.structures.join(', ') : t('none', uiLang)}</span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-fg-on-dark-quiet">{t('edge-guard', uiLang)}</span>
                              <span className={a.hasEdgeGuard ? 'text-emerald-400' : 'text-rose-400'}>
                                {a.hasEdgeGuard ? t('detected', uiLang) : t('not-detected', uiLang)}
                              </span>
                            </p>
                            <p className="flex justify-between">
                              <span className="text-fg-on-dark-quiet">{t('code-lines', uiLang)}</span>
                              <span className="text-fg-on-dark-secondary">{a.lineCount}{t('lines', uiLang)}</span>
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-brand-400/80 border-l-2 border-brand-400/40 pl-2 leading-relaxed">
                          💡 {problem.category} 유형에서는 {problem.tags[0] ?? '패턴 인식'}과 시간 복잡도를 먼저 점검하세요.
                          {!a.hasEdgeGuard && ' 면접관이 엣지 케이스 처리를 파고들 확률이 높습니다.'}
                        </p>
                      </div>
                    );
                  })()}

                  {/* 메모 — 입력 아래 오른쪽에 초기화/저장, 구분선 아래 이전 기록 테이블 */}
                  {sidebarTab === 'notes' && (
                    <div>
                      <label className="block text-sm text-fg-on-dark-secondary">
                        <span className="mb-2 block font-medium text-white">메모</span>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={7}
                          placeholder="핵심 아이디어, 오답 원인, 리팩토링 포인트를 적어두세요."
                          className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-fg-on-dark-quiet focus:outline-none focus:ring-2 focus:ring-signal/60"
                        />
                      </label>
                      {notes.trim().length > 0 && (
                        <div className="mt-1.5 flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setNotes('')}
                            className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] font-semibold text-fg-on-dark-secondary transition-colors hover:border-white/35 hover:text-white"
                          >
                            {t('reset', uiLang)}
                          </button>
                          <button
                            type="button"
                            onClick={saveMemo}
                            className="rounded-lg bg-signal px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600"
                          >
                            {t('save', uiLang)}
                          </button>
                        </div>
                      )}

                      <div className="mt-5 border-t border-white/10 pt-4">
                        <p className="mb-2 text-xs font-semibold text-fg-on-dark-secondary">{t('memo-history', uiLang)}</p>

                        {/* 컨트롤 바 — 정렬은 왼쪽 끝, 편집/편집 중 버튼셋은 오른쪽 끝 */}
                        {memoHistory.length > 0 && (
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <select
                              value={memoOrder}
                              onChange={(e) => setMemoOrder(e.target.value as 'latest' | 'oldest')}
                              aria-label={t('sort-order', uiLang)}
                              className="rounded border border-white/15 bg-ink px-2 py-1 text-[11px] text-fg-on-dark"
                            >
                              <option value="latest">{t('sort-latest', uiLang)}</option>
                              <option value="oldest">{t('sort-oldest', uiLang)}</option>
                            </select>

                            {memoEditing ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setSelectedMemoTs(allMemosSelected ? [] : orderedMemos.map((m) => m.ts))}
                                  className="rounded border border-white/15 px-2 py-1 text-[11px] text-fg-on-dark-secondary transition-colors hover:border-white/35 hover:text-white"
                                >
                                  {t(allMemosSelected ? 'deselect-all' : 'select-all', uiLang)}
                                </button>
                                <button
                                  type="button"
                                  onClick={deleteSelectedMemos}
                                  disabled={selectedMemoTs.length === 0}
                                  className="rounded border border-rose-400/30 px-2 py-1 text-[11px] text-rose-300 transition-colors hover:border-rose-400/60 disabled:opacity-30"
                                >
                                  {t('delete', uiLang)}
                                  {selectedMemoTs.length > 0 && ` ${selectedMemoTs.length}`}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setMemoEditing(false); setSelectedMemoTs([]); }}
                                  className="rounded bg-signal px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600"
                                >
                                  {t('save', uiLang)}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMemoEditing(true)}
                                className="rounded border border-white/15 px-2.5 py-1 text-[11px] text-fg-on-dark-secondary transition-colors hover:border-white/35 hover:text-white"
                              >
                                {t('edit', uiLang)}
                              </button>
                            )}
                          </div>
                        )}

                        {memoHistory.length === 0 ? (
                          <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-5 text-center text-[11px] text-fg-on-dark-quiet">
                            {t('no-memos-yet', uiLang)}
                          </p>
                        ) : (
                          <div className="overflow-hidden rounded-lg border border-white/10">
                            <table className="w-full text-left text-[11px]">
                              <thead>
                                <tr className="border-b border-white/10 bg-white/[0.03] font-mono text-fg-on-dark-quiet">
                                  {memoEditing && (
                                    <th className="w-8 px-2 py-2">
                                      <input
                                        type="checkbox"
                                        aria-label={t('select-all', uiLang)}
                                        checked={allMemosSelected}
                                        onChange={(e) => setSelectedMemoTs(e.target.checked ? orderedMemos.map((m) => m.ts) : [])}
                                      />
                                    </th>
                                  )}
                                  <th className="w-8 px-2 py-2" aria-label={t('pin-memo', uiLang)} />
                                  <th className="whitespace-nowrap px-3 py-2 font-medium">{t('written-at', uiLang)}</th>
                                  <th className="w-full px-3 py-2 font-medium">{t('content', uiLang)}</th>
                                  {!memoEditing && <th className="px-2 py-2" aria-label={t('delete', uiLang)} />}
                                </tr>
                              </thead>
                              <tbody>
                                {orderedMemos.map((m) => (
                                  <tr
                                    key={m.ts}
                                    onClick={() => {
                                      if (!memoEditing) return;
                                      setSelectedMemoTs((prev) =>
                                        prev.includes(m.ts) ? prev.filter((ts) => ts !== m.ts) : [...prev, m.ts],
                                      );
                                    }}
                                    className={`border-b border-white/5 align-top last:border-b-0 ${
                                      memoEditing ? 'cursor-pointer' : ''
                                    } ${
                                      memoEditing && selectedMemoTs.includes(m.ts)
                                        ? 'bg-signal/15'
                                        : m.pinned
                                          ? 'bg-brand-500/[0.07] hover:bg-brand-500/10'
                                          : 'hover:bg-white/[0.03]'
                                    }`}
                                  >
                                    {memoEditing && (
                                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="checkbox"
                                          checked={selectedMemoTs.includes(m.ts)}
                                          onChange={(e) =>
                                            setSelectedMemoTs((prev) => (e.target.checked ? [...prev, m.ts] : prev.filter((ts) => ts !== m.ts)))
                                          }
                                        />
                                      </td>
                                    )}
                                    {/* 상단 고정 핀 — 켜면 정렬과 무관하게 목록 맨 위로 */}
                                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={() => toggleMemoPin(m.ts)}
                                        aria-pressed={!!m.pinned}
                                        aria-label={t(m.pinned ? 'unpin-memo' : 'pin-memo', uiLang)}
                                        title={t(m.pinned ? 'unpin-memo' : 'pin-memo', uiLang)}
                                        className={`transition-colors ${m.pinned ? 'text-brand-300' : 'text-fg-on-dark-quiet hover:text-fg-on-dark-secondary'}`}
                                      >
                                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={m.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" aria-hidden>
                                          <path d="M9 3h6l-1 5 3.5 3.5H14V21l-2-2-2 2v-9.5H6.5L10 8 9 3Z" strokeLinejoin="round" />
                                        </svg>
                                      </button>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 font-mono text-fg-on-dark-muted">
                                      {new Date(m.ts).toLocaleString(uiLang === 'en' ? 'en-US' : 'ko-KR', {
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </td>
                                    <td className="whitespace-pre-wrap px-3 py-2 leading-relaxed text-fg-on-dark">{m.text}</td>
                                    {!memoEditing && (
                                      <td className="px-2 py-2">
                                        <button
                                          type="button"
                                          onClick={() => setMemoHistory((prev) => prev.filter((x) => x.ts !== m.ts))}
                                          aria-label={t('delete-memo', uiLang)}
                                          className="text-fg-on-dark-quiet transition-colors hover:text-rose-400"
                                        >
                                          ✕
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            interview && (
              <InterviewPanel
                sessionId={interview.sessionId}
                firstQuestion={interview.firstQuestion}
                getCurrentCode={() => codeRef.current}
                mode={interviewMode}
                voice={voiceMode}
                config={interviewConfig}
                model={chatModel}
                onModelChange={setChatModel}
                access={aiAccess}
              />
            )
          )}
        </div>

        {/* 좌/우 스플리터 (데스크톱 전용) */}
        <SplitHandle axis="x" containerRef={rowRef} onPct={setLeftPct} label="패널 너비 조절" className="hidden lg:flex" />

        {/* 우: 검정 에디터 카드 (데모와 동일한 크롬) */}
        <div className="relative flex min-h-[380px] lg:min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0B0D12]">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
            <span className="font-mono text-[10px] text-fg-on-dark-quiet">solution.{language === 'python' ? 'py' : 'js'}</span>
            <span className="text-[9px] uppercase tracking-wider text-fg-on-dark-quiet">sandbox</span>
            {mode === 'INTERVIEW' && (
              <span className="font-mono text-[10px] text-brand-300">라이브 리팩터링 가능</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value as Language);
                  setResults([]);
                }}
                disabled={mode === 'INTERVIEW'}
                className="bg-ink border border-white/15 rounded-lg px-2.5 py-1 font-mono text-[11px] text-fg-on-dark focus:outline-none focus:border-signal disabled:opacity-50"
              >
                {(Object.keys(LANGUAGE_LABELS) as Language[]).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l]}
                  </option>
                ))}
              </select>
              <button
                data-tour="run"
                onClick={handleRun}
                disabled={judging || submitting || timeUp}
                title={timeUp ? t('time-over', uiLang) : mode === 'INTERVIEW' ? t('run-again', uiLang) : t('run', uiLang)}
                className="inline-flex h-8 items-center rounded-lg border border-white/15 px-3 text-[11px] font-semibold text-fg-on-dark transition-colors hover:bg-white/10 disabled:opacity-40"
              >
                {judging ? `${t('running', uiLang)}…` : mode === 'INTERVIEW' ? t('run-again', uiLang) : t('run', uiLang)}
              </button>
              {mode === 'SOLVING' && (
                <button
                  data-tour="submit"
                  onClick={() => handleSubmit()}
                  disabled={judging || submitting || timeUp}
                  title={timeUp ? t('time-over', uiLang) : t('submit-label', uiLang)}
                  className="inline-flex h-8 items-center rounded-lg bg-signal px-3.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                >
                  {submitting ? `${t('submitting', uiLang)}…` : t('submit-label', uiLang)}
                </button>
              )}
            </div>
          </div>

          {runtimeLoading && (
            <div className="px-4 py-2 bg-signal/10 border-b border-signal/20 font-mono text-[11px] text-brand-300">
              Python 런타임(Pyodide)을 불러오는 중입니다… 첫 실행은 몇 초 걸릴 수 있어요.
            </div>
          )}
          {banner && (
            <div className="px-4 py-2 bg-rose-500/10 border-b border-rose-500/20 text-xs text-rose-300 flex items-center gap-3">
              {banner}
              {!isLoggedIn && (
                <Link href="/login" className="underline underline-offset-2 text-rose-200 font-semibold">
                  로그인하기
                </Link>
              )}
            </div>
          )}

          {/* 에디터/터미널 — 세로 스플리터로 높이 조절 */}
          <div ref={editorColRef} className="flex min-h-0 flex-grow flex-col">
            <div style={{ height: `${100 - termPct}%` }} className="min-h-0 overflow-hidden">
              <EditorPanel language={language} value={code} onChange={setCode} />
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

          {/* Agent 코드 생성 연출 — 분석 → 작성(한 줄씩) → 완성된 코드가 에디터에 들어간다.
              리팩토링모드로 넘어가는 동안(dqLoading)에도 같은 연출을 띄운다. 그 시간이 곧
              서버가 결함 코드를 만드는 시간이라, 빈 화면으로 두면 무엇이 도는지 알 수 없다.
              코드가 도착하면 debateQ 패널이 이어서 작성 단계를 보여 준다. */}
          {(agentCode !== null || dqLoading) && (
            <AgentCodegen
              code={dqLoading ? null : agentCode}
              language={language}
              onDone={() => {
                if (agentCode === null) return; // 리팩토링 전환 중이면 반영할 코드가 없다
                setCode(agentCode);
                setAgentCode(null);
                setResults([]);
              }}
            />
          )}

          {/* 정답 이후 화면 — 모드에 따라 학습 완료 / 면접형으로 갈린다 */}
          {completion && (
            <CompletionPanel
              mode={activeMode}
              correct={completion.correct}
              cta={completionCta(entry)}
              onContinue={() => setCompletion(null)}
              onRetry={() => setCompletion(null)}
            />
          )}

          {/* 엄격모드 시간 종료 — 실행·제출이 막힌다. 여기서만 설정을 다시 고를 수 있다
              (시계도 코드도 처음부터 다시 시작한다). */}
          {timeUp && !completion && (
            <div className="absolute inset-0 z-30 grid place-items-center bg-ink/90 p-6 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-[var(--radius-panel)] border border-rose-500/30 bg-[#12141C] p-6 text-center">
                <p className="text-4xl">⏳</p>
                <p className="mt-3 text-xl font-bold text-rose-300" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  {t('time-over', uiLang)}
                </p>
                <p className="mt-1.5 text-sm text-fg-on-dark-muted">
                  {setup.limitMinutes}
                  {t('minutes-short', uiLang)} {t('time-over-desc', uiLang)}
                </p>
                <button
                  type="button"
                  onClick={restartSolving}
                  className="mt-5 w-full rounded-xl bg-signal py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
                >
                  {t('setup-restart', uiLang)}
                </button>
                <Link
                  href={entry.returnPath}
                  className="mt-2 block w-full rounded-xl border border-white/15 py-2.5 text-sm font-medium text-fg-on-dark-secondary transition hover:border-white/35 hover:text-white"
                >
                  {entry.source === 'SET' && entry.setTitle ? `${entry.setTitle}(으)로 돌아가기` : '문제집으로 돌아가기'}
                </Link>
              </div>
            </div>
          )}

          {/* 면접 모드 선택 오버레이 */}
          {pendingInterview && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/85 backdrop-blur-sm p-6">
              <div className="dc-scroll max-h-[88vh] w-full max-w-md space-y-5 overflow-y-auto rounded-xl border border-white/10 bg-ink-soft p-6">
                <div>
                  <p className="font-mono text-[11px] text-brand-300 tracking-wider mb-1">INTERVIEW SETUP</p>
                  <h3 className="text-lg font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                    면접 방식을 선택하세요
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setInterviewMode('basic')}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      interviewMode === 'basic'
                        ? 'border-signal bg-signal/10'
                        : 'border-white/15 hover:border-white/35'
                    }`}
                  >
                    <p className="font-semibold text-sm mb-1">기본 모드</p>
                    <p className="text-xs text-fg-on-dark-muted leading-relaxed">시간 제한 없이 충분히 고민하며 답변합니다.</p>
                  </button>
                  <button
                    onClick={() => setInterviewMode('strict')}
                    className={`text-left rounded-lg border p-4 transition-colors ${
                      interviewMode === 'strict'
                        ? 'border-rose-400 bg-rose-500/10'
                        : 'border-white/15 hover:border-white/35'
                    }`}
                  >
                    <p className="font-semibold text-sm mb-1 text-rose-300">엄격 모드</p>
                    <p className="text-xs text-fg-on-dark-muted leading-relaxed">답변마다 90초 제한. 실전처럼 압박 속에서 방어합니다.</p>
                  </button>
                </div>

                {/* 면접 질문 커스텀 — 같은 코드라도 무엇을 파고드느냐에 따라 다른 면접이 된다 */}
                <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">면접 질문 커스텀</p>

                  {/* 문항 수 */}
                  <div className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-fg-on-dark-secondary">문항 수</span>
                    <div className="flex items-center gap-1">
                      {ROUND_CHOICES.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setInterviewConfig((prev) => ({ ...prev, rounds: n }))}
                          aria-pressed={interviewConfig.rounds === n}
                          className={`h-7 w-7 rounded-lg text-[11px] font-semibold transition-colors ${
                            interviewConfig.rounds === n
                              ? 'bg-signal text-white'
                              : 'border border-white/15 text-fg-on-dark-muted hover:border-white/35 hover:text-white'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="ml-auto text-[10px] text-fg-on-dark-quiet">3연속 완벽 방어 시 조기 종료</span>
                  </div>

                  {/* 난이도 — 시작 코드 난이도와 같은 세 칸·같은 디자인 */}
                  <div className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-fg-on-dark-secondary">난이도</span>
                    <div className="rounded-lg border border-white/15 bg-white/5 p-0.5 text-[11px] font-semibold">
                      <SegmentedControl
                        ariaLabel="면접 난이도"
                        value={interviewConfig.level}
                        onChange={(level: InterviewLevel) => setInterviewConfig((prev) => ({ ...prev, level }))}
                        options={(['easy', 'normal', 'hard'] as InterviewLevel[]).map((l) => ({
                          key: l,
                          label: LEVEL_LABELS[l],
                          title: LEVEL_HINTS[l],
                        }))}
                      />
                    </div>
                  </div>
                  <p className="pl-[4.25rem] text-[10.5px] leading-relaxed text-fg-on-dark-quiet">
                    {LEVEL_HINTS[interviewConfig.level]}
                  </p>

                  {/* 경향 */}
                  <div className="flex items-start gap-3">
                    <span className="w-14 shrink-0 pt-1 text-xs text-fg-on-dark-secondary">경향</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(FOCUS_LABELS) as InterviewFocus[]).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setInterviewConfig((prev) => ({ ...prev, focus: f }))}
                            aria-pressed={interviewConfig.focus === f}
                            title={FOCUS_HINTS[f]}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                              interviewConfig.focus === f
                                ? 'bg-signal text-white'
                                : 'border border-white/15 text-fg-on-dark-muted hover:border-white/35 hover:text-white'
                            }`}
                          >
                            {FOCUS_LABELS[f]}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[10.5px] leading-relaxed text-fg-on-dark-quiet">
                        {FOCUS_HINTS[interviewConfig.focus]}
                      </p>
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-3 rounded-lg border border-white/15 px-4 py-3 cursor-pointer hover:border-white/35 transition-colors">
                  <input
                    type="checkbox"
                    checked={voiceMode}
                    onChange={(e) => setVoiceMode(e.target.checked)}
                    className="accent-[#4531d9]"
                  />
                  <span className="text-sm">
                    🔊 보이스 모드
                    <span className="block text-xs text-fg-on-dark-muted">AI 질문을 음성으로 듣고, 마이크로 답변합니다 (Chrome/Edge)</span>
                  </span>
                </label>

                <button
                  onClick={() => void enterInterview()}
                  disabled={enteringInterview}
                  className="w-full py-3.5 bg-signal text-white font-semibold rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-50"
                >
                  {enteringInterview ? '면접관이 질문을 준비하는 중…' : '면접장 입장'}
                </button>
              </div>
            </div>
          )}

          {/* 전체 통과 축하 오버레이 — 면접으로 이어지는 경로에서만 쓴다.
              시그니처모드는 CompletionPanel의 학습 완료 카드로 대체된다. */}
          {passedFlash && activeMode !== 'signature' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink/80 backdrop-blur-sm">
              <div className="text-center space-y-3">
                <div className="text-5xl">🎯</div>
                <p className="text-2xl font-bold text-emerald-400" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
                  ALL TESTS PASSED
                </p>
                <p className="font-mono text-sm text-fg-on-dark-secondary">AI 면접관이 코드를 분석하고 있습니다…</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
