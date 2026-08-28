// 공유 타입. JSON 필드는 Prisma의 네이티브 Json 타입을 사용하므로
// DB에서 읽은 값은 이미 파싱된 객체다 (parse/stringify 불필요).

export type Language = 'javascript' | 'python';

export const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: 'JavaScript',
  python: 'Python',
};

/** 화면에 늘 같은 순서로 나열하기 위한 목록 — 객체 키 순서에 기대지 않는다. */
export const LANGUAGES: Language[] = ['javascript', 'python'];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as string[]).includes(value);
}

/**
 * 이 문제가 지원하는 언어 — starterCodes에 **비어 있지 않은** 코드가 들어 있는 언어만.
 *
 * 지원 언어를 따로 두는 컬럼은 없다. 스타터 코드가 곧 "이 언어로 풀 수 있다"는 뜻이고,
 * 둘을 나눠 두면 언젠가 서로 어긋난다 — 목록에는 뜨는데 에디터를 열면 빈 화면인 문제가
 * 생긴다. 빈 문자열을 걸러 내는 이유도 같다. 키만 있고 내용이 없으면 지원이 아니다.
 */
export function problemLanguages(starterCodes: unknown): Language[] {
  if (!starterCodes || typeof starterCodes !== 'object') return [];
  const codes = starterCodes as Record<string, unknown>;
  return LANGUAGES.filter((l) => typeof codes[l] === 'string' && (codes[l] as string).trim().length > 0);
}

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '입문',
  2: '초급',
  3: '중급',
  4: '고급',
};

// ---------- 채점(judge) 워커 프로토콜 ----------

// 워커에 넘기는 케이스 — 입력만이다.
//
// 기대 출력(expected)이 여기 없는 것은 실수가 아니라 설계다. 채점 판정이 서버로
// 옮겨 갔고(app/lib/judge/server.ts), 기대 출력은 브라우저까지 내려오지 않는다.
// 예전에는 히든 케이스의 정답까지 통째로 내려가서 사실상 숨겨진 것이 없었다.
export interface JudgeCase {
  id: number;
  args: unknown[];
}

export type JudgeRunMessage = {
  type: 'run';
  code: string;
  cases: JudgeCase[];
};

export type CaseStatus = 'pass' | 'fail' | 'error' | 'timeout';

/** 워커가 보고하는 것 — 실행 결과이지 판정이 아니다. */
export type CaseOutcomeKind = 'returned' | 'error' | 'timeout';

export type JudgeWorkerMessage =
  | { type: 'ready' }
  | { type: 'worker-error'; errorMessage?: string }
  | {
      type: 'case-outcome';
      id: number;
      outcome: CaseOutcomeKind;
      actual?: unknown;
      stdout: string;
      timeMs: number;
      errorMessage?: string;
    }
  | { type: 'done'; total: number };

/** 서버가 내린 케이스별 판정. 히든 케이스에는 actual·expected가 담기지 않는다. */
export interface CaseResult {
  id: number;
  status: CaseStatus;
  actual?: unknown;
  expected?: unknown;
  stdout: string;
  timeMs: number;
  errorMessage?: string;
  isHidden: boolean;
}

export interface JudgeRunResult {
  status: 'PASS' | 'FAIL' | 'ERROR' | 'TIMEOUT';
  passed: number;
  total: number;
  maxTimeMs: number;
  results: CaseResult[];
}

// ---------- 면접(interview) ----------

export interface ChatMessage {
  role: 'ai' | 'user';
  content: string;
  round: number;
  ts: number;
}

export interface CodeAnalysis {
  complexityGuess: string; // "O(n)" | "O(n²)" 등
  maxLoopDepth: number;
  hasNestedLoops: boolean;
  usesRecursion: boolean;
  structures: string[]; // ["해시 맵", "정렬"] 등
  hasEdgeGuard: boolean;
  lineCount: number;
}

export type RoundVerdict = 'DEFENDED' | 'PARTIAL' | 'CONCEDED';

export interface RoundEval {
  round: number;
  question: string;
  answer: string;
  verdict: RoundVerdict;
  score: number; // 0-100
  feedback: string;
  matchedKeywords: string[];
  missedKeywords: string[];
}

export interface DefenseReport {
  defenseScore: number; // 0-100 방어 성공률
  rounds: RoundEval[];
  summary: string;
  weakKeywords: string[];
  strongKeywords: string[];
}

// debateQ 코드 버전 기록 — AI가 생성/수정한 모든 코드가 열람 가능하게 저장된다
export interface CodeRecord {
  code: string;
  note: string;
  ts: number;
}

export interface ProblemMeta {
  id: number;
  title: string;
  category: string;
  difficulty: number;
  keywords: string[];
}

export interface StarterCodes {
  javascript: string;
  python: string;
}
