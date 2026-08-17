// 채점 클라이언트 — public/judge/*.js 워커를 스폰하고 프로토콜을 관리한다.
// 워커는 언어별로 페이지 수명 동안 재사용 (Pyodide 재로드 비용 절약).
// 타임아웃 시 worker.terminate() 후 다음 실행에서 재스폰.
import type {
  CaseResult,
  JudgeCase,
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
  const ready = new Promise<void>((res) => (resolveReady = res));
  onLoading?.(true);
  const handleReady = (e: MessageEvent<JudgeWorkerMessage>) => {
    if (e.data.type === 'ready') {
      onLoading?.(false);
      worker.removeEventListener('message', handleReady);
      resolveReady!();
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

export interface RunJudgeOptions {
  language: Language;
  code: string;
  cases: Array<JudgeCase & { isHidden: boolean }>;
  timeLimitMs: number;
  /** Pyodide 등 런타임 로딩 상태 알림 */
  onRuntimeLoading?: (loading: boolean) => void;
  /** 케이스 결과가 도착할 때마다 호출 (UI 행 단위 갱신) */
  onCaseResult?: (result: CaseResult) => void;
}

export async function runJudge(opts: RunJudgeOptions): Promise<JudgeRunResult> {
  const { language, code, cases, timeLimitMs, onRuntimeLoading, onCaseResult } = opts;

  const slot = slots.get(language) ?? spawn(language, onRuntimeLoading);
  await slot.ready;

  const hiddenById = new Map(cases.map((c) => [c.id, c.isHidden]));
  const results: CaseResult[] = [];
  let maxTimeMs = 0;

  return new Promise<JudgeRunResult>((resolve) => {
    const { worker } = slot;
    let finished = false;

    // 전체 실행 타임아웃: 케이스 수 × 제한시간 + 여유
    const budget = timeLimitMs * Math.max(1, cases.length) + 2000;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      worker.terminate();
      slots.delete(language); // 다음 실행에서 재스폰
      const doneIds = new Set(results.map((r) => r.id));
      for (const c of cases) {
        if (!doneIds.has(c.id)) {
          const r: CaseResult = {
            id: c.id,
            status: 'timeout',
            stdout: '',
            timeMs: timeLimitMs,
            errorMessage: '시간 초과',
            isHidden: hiddenById.get(c.id) ?? false,
          };
          results.push(r);
          onCaseResult?.(r);
        }
      }
      resolve({
        status: 'TIMEOUT',
        passed: results.filter((r) => r.status === 'pass').length,
        total: cases.length,
        maxTimeMs: timeLimitMs,
        results,
      });
    }, budget);

    const handler = (e: MessageEvent<JudgeWorkerMessage>) => {
      const msg = e.data;
      if (msg.type === 'case-result') {
        const r: CaseResult = { ...msg, isHidden: hiddenById.get(msg.id) ?? false };
        results.push(r);
        maxTimeMs = Math.max(maxTimeMs, msg.timeMs);
        onCaseResult?.(r);
      } else if (msg.type === 'done') {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.removeEventListener('message', handler);
        const hasError = results.some((r) => r.status === 'error');
        const allPass = msg.passed === msg.total && msg.total > 0;
        resolve({
          status: allPass ? 'PASS' : hasError ? 'ERROR' : 'FAIL',
          passed: msg.passed,
          total: msg.total,
          maxTimeMs: Math.round(maxTimeMs * 100) / 100,
          results,
        });
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({
      type: 'run',
      code,
      cases: cases.map(({ id, args, expected }) => ({ id, args, expected })),
    });
  });
}
