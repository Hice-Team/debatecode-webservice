// 공유 타입. JSON 필드는 Prisma의 네이티브 Json 타입을 사용하므로
// DB에서 읽은 값은 이미 파싱된 객체다 (parse/stringify 불필요).

export type Language = 'javascript' | 'python';

export const LANGUAGE_LABELS: Record<Language, string> = {
  javascript: 'JavaScript',
  python: 'Python',
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '입문',
  2: '초급',
  3: '중급',
  4: '고급',
};

// ---------- 채점(judge) 워커 프로토콜 ----------

export interface JudgeCase {
  id: number;
  args: unknown[];
  expected: unknown;
}

export type JudgeRunMessage = {
  type: 'run';
  code: string;
  cases: JudgeCase[];
};

export type CaseStatus = 'pass' | 'fail' | 'error' | 'timeout';

export type JudgeWorkerMessage =
  | { type: 'ready' }
  | {
      type: 'case-result';
      id: number;
      status: CaseStatus;
      actual?: unknown;
      expected?: unknown;
      stdout: string;
      timeMs: number;
      errorMessage?: string;
    }
  | { type: 'done'; passed: number; total: number };

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
