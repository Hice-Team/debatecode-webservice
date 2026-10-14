// 채점 클라이언트 — 세션을 열고, 워커로 실행하고, 서버 판정을 받아 온다.
//
// 세 단계다.
//   ① /api/judge/session   서버가 케이스 **입력**을 내려준다 (기대 출력은 오지 않는다)
//   ② 워커                  코드를 돌려 케이스별 실제 출력을 만든다 (비교하지 않는다)
//   ③ /api/judge/verify     서버가 대조해 판정하고 기록한다 — 이 응답이 최종 결과다
//
// 화면이 보는 결과는 언제나 ③에서 온다. 예전에는 ②가 곧 결과였고, 그 값이 그대로
// 점수·포인트로 이어졌다 — 즉 이용자가 자기 점수를 정할 수 있었다.
//
// 워커는 언어별로 페이지 수명 동안 재사용한다 (Pyodide 재로드 비용 절약).
// 타임아웃 시 terminate 후 다음 실행에서 재스폰.
import type {
  CaseResult,
  JudgeRunResult,
  JudgeWorkerMessage,
  Language,
} from '@/app/lib/types';

const WORKER_URLS: Record<Language, string> = {
  javascript: '/judge/js-runner.js',
  python: '/judge/py-runner.js',
};

interface WorkerSlot {
  worker: Worker;
  ready: Promise<void>;
}

const slots = new Map<Language, WorkerSlot>();

function spawn(language: Language, onLoading?: (loading: boolean) => void): WorkerSlot {
  const worker = new Worker(WORKER_URLS[language]);
  let resolveReady: () => void;
  let rejectReady: (reason?: unknown) => void;
  const ready = new Promise<void>((res, reject) => {
    resolveReady = res;
    rejectReady = reject;
  });
  onLoading?.(true);
  const handleReady = (e: MessageEvent<JudgeWorkerMessage>) => {
    if (e.data.type === 'ready') {
      onLoading?.(false);
      worker.removeEventListener('message', handleReady);
      resolveReady!();
    }
    if (e.data.type === 'worker-error') {
      onLoading?.(false);
      worker.removeEventListener('message', handleReady);
      rejectReady!(new JudgeError(e.data.errorMessage ?? '실행기를 불러오지 못했습니다.'));
    }
  };
  worker.addEventListener('message', handleReady);
  const slot = { worker, ready };
  slots.set(language, slot);
  return slot;
}

export function disposeJudgeWorkers() {
  for (const { worker } of slots.values()) worker.terminate();
  slots.clear();
}

/** 워커가 돌려준 한 케이스의 실행 결과 — 판정 전이다. */
interface CaseOutcome {
  id: number;
  outcome: 'returned' | 'error' | 'timeout';
  actual?: unknown;
  stdout: string;
  timeMs: number;
  errorMessage?: string;
}

export interface RunJudgeOptions {
  language: Language;
  code: string;
  problemId: number;
  /** run 예제만 · submit 히든 포함 (서버가 정한다) */
  kind: 'run' | 'submit';
  /** Pyodide 등 런타임 로딩 상태 알림 */
  onRuntimeLoading?: (loading: boolean) => void;
  /** 케이스 실행이 끝날 때마다 — 진행 표시용. 판정은 아직 아니다. */
  onCaseProgress?: (done: number, total: number) => void;
}

/** 서버 판정 + 그 판정에 딸린 후속 정보(제출 id, 면접 세션 등) */
export interface JudgeOutcome {
  verdict: JudgeRunResult;
  attempt?: { id: string; createdAt: string };
  submissionId?: string;
  interviewSessionId?: string;
  firstQuestion?: string;
  interviewDisabled?: boolean;
}

export class JudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JudgeError';
  }
}

export async function runJudge(opts: RunJudgeOptions): Promise<JudgeOutcome> {
  const { language, code, problemId, kind, onRuntimeLoading, onCaseProgress } = opts;

  /* ---------- ① 세션 열기 ---------- */
  const openRes = await fetch('/api/judge/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problemId, language, code, kind }),
  });
  const opened = await openRes.json().catch(() => null);
  if (!openRes.ok || !opened?.sessionId) {
    throw new JudgeError(opened?.error ?? '채점을 시작하지 못했습니다.');
  }

  const cases: Array<{ id: number; args: unknown[] }> = opened.cases;
  const timeLimitMs: number = opened.timeLimitMs ?? 3000;

  /* ---------- ② 워커 실행 ---------- */
  const outcomes = await executeInWorker({
    language,
    code,
    cases,
    timeLimitMs,
    onRuntimeLoading,
    onCaseProgress,
  });

  /* ---------- ③ 서버 판정 ---------- */
  const verifyRes = await fetch('/api/judge/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: opened.sessionId, code, outcomes }),
  });
  const judged = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || !judged?.verdict) {
    throw new JudgeError(judged?.error ?? '채점 결과를 받지 못했습니다.');
  }

  return judged as JudgeOutcome;
}

/** 워커에 코드를 넘겨 케이스별 실제 출력을 모은다. 여기서는 아무것도 판정하지 않는다. */
function executeInWorker(opts: {
  language: Language;
  code: string;
  cases: Array<{ id: number; args: unknown[] }>;
  timeLimitMs: number;
  onRuntimeLoading?: (loading: boolean) => void;
  onCaseProgress?: (done: number, total: number) => void;
}): Promise<CaseOutcome[]> {
  const { language, code, cases, timeLimitMs, onRuntimeLoading, onCaseProgress } = opts;

  return new Promise<CaseOutcome[]>((resolve) => {
    const slot = slots.get(language) ?? spawn(language, onRuntimeLoading);
    const outcomes: CaseOutcome[] = [];
    let finished = false;

    void slot.ready.then(() => {
      const { worker } = slot;

      // 전체 실행 예산: 케이스 수 × 제한시간 + 여유
      const budget = timeLimitMs * Math.max(1, cases.length) + 2000;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        worker.terminate();
        slots.delete(language); // 다음 실행에서 재스폰
        const done = new Set(outcomes.map((o) => o.id));
        for (const c of cases) {
          if (!done.has(c.id)) {
            outcomes.push({
              id: c.id,
              outcome: 'timeout',
              stdout: '',
              timeMs: timeLimitMs,
              errorMessage: '시간 초과',
            });
          }
        }
        resolve(outcomes);
      }, budget);

      const handler = (e: MessageEvent<JudgeWorkerMessage>) => {
        const msg = e.data;
        if (msg.type === 'case-outcome') {
          outcomes.push({
            id: msg.id,
            outcome: msg.outcome,
            actual: msg.actual,
            stdout: msg.stdout,
            timeMs: msg.timeMs,
            errorMessage: msg.errorMessage,
          });
          onCaseProgress?.(outcomes.length, cases.length);
          return;
        }
        if (msg.type === 'done') {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          worker.removeEventListener('message', handler);
          resolve(outcomes);
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'run', code, cases, timeLimitMs });
    }).catch((error) => {
      if (finished) return;
      finished = true;
      slots.delete(language);
      onRuntimeLoading?.(false);
      slot.worker.terminate();
      resolve(
        cases.map((c) => ({
          id: c.id,
          outcome: 'error' as const,
          stdout: '',
          timeMs: 0,
          errorMessage: error instanceof Error ? error.message : '실행기를 불러오지 못했습니다.',
        })),
      );
    });
  });
}

/** 채점 전 자리를 채워 둘 빈 결과 — 표가 갑자기 사라지지 않게. */
export function pendingResults(ids: number[]): CaseResult[] {
  return ids.map((id) => ({
    id,
    status: 'fail' as const,
    stdout: '',
    timeMs: 0,
    isHidden: false,
  }));
}
