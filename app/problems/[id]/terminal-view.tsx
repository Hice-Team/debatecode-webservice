'use client';

// 터미널 탭 — VS Code 통합 터미널을 기준으로 삼는다.
//
// 정답 일치(T/F)와 무관하게 케이스별 실행 출력(stdout·반환값·에러)을 그대로 보여 준다.
// 채점표가 아니라 "무슨 일이 일어났는가"의 기록이라, 실행한 명령까지 프롬프트로 남긴다.
// 히든 케이스는 입력·출력을 가린다.
//
// 색은 의미에만 쓴다(DESIGN.md §2) — 성공/실패/인자/시간 넷뿐이고 장식은 없다.
import type { CaseResult, Language } from '@/app/lib/types';

/** 실행 파일 이름 — 명령 줄을 그럴듯하게 꾸미려는 것이 아니라 무엇으로 돌았는지 밝히려는 것이다. */
const RUNNER: Record<Language, { cmd: string; file: string }> = {
  javascript: { cmd: 'node', file: 'solution.js' },
  python: { cmd: 'python', file: 'solution.py' },
};

function fmt(v: unknown): string {
  try {
    return JSON.stringify(v) ?? 'undefined';
  } catch {
    return String(v);
  }
}

export default function TerminalView({
  results,
  argsById,
  language = 'javascript',
}: {
  results: CaseResult[];
  argsById: Map<number, unknown[]>;
  language?: Language;
}) {
  if (results.length === 0) {
    return (
      <div className="p-4 font-mono text-[13px] leading-relaxed text-slate-500">
        실행하면 정답 여부와 관계없이 모든 실행 출력이 여기에 표시됩니다.
      </div>
    );
  }

  const runner = RUNNER[language] ?? RUNNER.javascript;
  const failed = results.filter((r) => r.status !== 'pass').length;
  const totalMs = results.reduce((sum, r) => sum + r.timeMs, 0);

  return (
    <div className="p-4 font-mono text-[13px] leading-relaxed">
      {results.map((r, i) => {
        const args = argsById.get(r.id);
        return (
          <div key={r.id} className="mb-3 last:mb-0">
            {/* 명령 줄 — 무엇을 어떤 인자로 돌렸는지 */}
            <p className="break-all">
              <span className="text-emerald-400">➜</span>{' '}
              <span className="text-slate-500">~/debatecode</span>{' '}
              <span className="text-fg-on-dark">
                {runner.cmd} {runner.file}
              </span>{' '}
              {r.isHidden ? (
                <span className="text-slate-500">--case {i + 1} (hidden)</span>
              ) : args ? (
                <span className="text-amber-300">{args.map(fmt).join(' ')}</span>
              ) : (
                <span className="text-slate-500">--case {i + 1}</span>
              )}
            </p>

            {r.isHidden ? (
              <p className="pl-4 text-slate-500">히든 케이스 — 입력과 출력이 숨겨집니다</p>
            ) : (
              <div className="pl-4">
                {r.stdout && <pre className="whitespace-pre-wrap text-fg-on-dark-secondary">{r.stdout}</pre>}
                {r.status === 'error' ? (
                  <p className="whitespace-pre-wrap font-semibold text-rose-400">
                    {r.errorMessage ?? '실행 중 오류가 발생했습니다'}
                  </p>
                ) : r.status === 'timeout' ? (
                  <p className="font-semibold text-amber-400">
                    시간 초과 — 실행이 중단되었습니다{' '}
                    <span className="font-normal text-slate-500">({r.timeMs}ms)</span>
                  </p>
                ) : (
                  <p>
                    <span className="text-cyan-300">return</span>{' '}
                    <span className={r.status === 'pass' ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
                      {fmt(r.actual)}
                    </span>{' '}
                    <span className="dc-num text-slate-500">({r.timeMs}ms)</span>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* 종료 상태 — 셸이 마지막에 남기는 줄과 같은 자리 */}
      <p className="mt-4 border-t border-white/10 pt-3">
        <span className="text-slate-500">exit status</span>{' '}
        <span className={failed === 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'}>
          {failed === 0 ? '0' : '1'}
        </span>{' '}
        <span className="dc-num text-slate-500">
          · {results.length}개 케이스 · 총 {totalMs}ms
        </span>
      </p>
    </div>
  );
}
