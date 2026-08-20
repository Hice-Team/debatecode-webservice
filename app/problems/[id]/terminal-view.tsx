'use client';

// 터미널 뷰 — 정답 일치(T/F)와 무관하게 케이스별 실행 출력(stdout·반환값·에러)을 그대로 보여준다.
// 히든 케이스는 입력·출력을 가린다.
import type { CaseResult } from '@/app/lib/types';

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
}: {
  results: CaseResult[];
  argsById: Map<number, unknown[]>;
}) {
  if (results.length === 0) {
    return (
      <div className="p-4 font-mono text-xs text-fg-on-dark-quiet">
        실행하면 정답 여부와 관계없이 모든 실행 출력이 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 font-mono text-xs leading-relaxed">
      {results.map((r, i) => {
        const args = argsById.get(r.id);
        return (
          <div key={r.id}>
            <p className="text-fg-on-dark-quiet">
              <span className="text-brand-300">$</span> case #{i + 1}
              {r.isHidden ? ' (hidden)' : args ? ` — 입력: ${args.map(fmt).join(', ')}` : ''}
            </p>
            {r.isHidden ? (
              <p className="pl-4 text-fg-on-dark-quiet">히든 케이스 — 입력과 출력이 숨겨집니다</p>
            ) : (
              <div className="pl-4">
                {r.stdout && <pre className="whitespace-pre-wrap text-fg-on-dark">{r.stdout}</pre>}
                {r.status === 'error' ? (
                  <p className="text-rose-300/90">{r.errorMessage ?? '실행 중 오류가 발생했습니다'}</p>
                ) : r.status === 'timeout' ? (
                  <p className="text-brand-300/90">시간 초과 — 실행이 중단되었습니다 ({r.timeMs}ms)</p>
                ) : (
                  <p className="text-emerald-300/85">
                    ↩ return {fmt(r.actual)} <span className="text-fg-on-dark-quiet">({r.timeMs}ms)</span>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
