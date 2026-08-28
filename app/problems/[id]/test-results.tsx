'use client';

// 테스트 결과 탭 — 표가 아니라 "요약 배너 + 케이스 탭 + 상세 카드"다.
//
// 예전에는 케이스마다 한 줄짜리 표였다. 줄 하나에 기대값·실제값·stdout을 우겨 넣으니
// 60자에서 잘리고, 무엇이 왜 틀렸는지 보려면 잘린 값을 짐작해야 했다.
// 지금은 ① 통과했는지부터 크게 말하고 ② 케이스를 골라 ③ 입력·기대·실제·시간을
// 각각 제 칸에 모노스페이스로 펼친다.
import { useState } from 'react';
import type { CaseResult } from '@/app/lib/types';

const STATUS: Record<CaseResult['status'], { label: string; mark: string; className: string }> = {
  pass: { label: '통과', mark: '✓', className: 'text-emerald-400' },
  fail: { label: '불일치', mark: '✗', className: 'text-rose-400' },
  error: { label: '실행 오류', mark: '✗', className: 'text-rose-400' },
  timeout: { label: '시간 초과', mark: '✗', className: 'text-amber-400' },
};

/** 값 하나를 코드 블록에 넣을 문자열로. 길어도 자르지 않는다 — 자르면 볼 이유가 없다. */
function fmt(v: unknown): string {
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}

/** 값 한 칸 — 라벨과 모노스페이스 코드 블록. */
function Field({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-fg-on-dark-secondary';
  return (
    <div className="min-w-0">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">{label}</p>
      <pre
        className={`dc-scroll overflow-x-auto rounded-[var(--radius-card)] border border-white/10 bg-black/25 px-3 py-2 font-mono text-[12px] leading-relaxed ${color}`}
      >
        {value}
      </pre>
    </div>
  );
}

export default function TestResults({
  results,
  total,
  argsById,
}: {
  results: CaseResult[];
  total: number;
  /** 예제 케이스의 입력 인자 — 히든 케이스는 애초에 브라우저로 오지 않는다 */
  argsById: Map<number, unknown[]>;
}) {
  // 다시 실행하면 케이스 수가 달라질 수 있다. 상태를 effect로 되돌리는 대신
  // 렌더에서 클램프한다 — 연쇄 렌더 없이 없는 케이스를 가리키는 일도 없다.
  const [picked, setActive] = useState(0);

  if (results.length === 0) {
    return (
      <div className="p-4 font-mono text-xs text-fg-on-dark-quiet">
        실행 버튼을 누르면 테스트 케이스 결과가 여기에 표시됩니다.
      </div>
    );
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const allPassed = passed === total && total > 0;
  const active = Math.min(picked, results.length - 1);
  const current = results[active];
  const st = STATUS[current.status];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ① 요약 배너 — 통과했는지부터 말한다 */}
      <div
        role="status"
        className={`flex shrink-0 items-center gap-3 border-b px-4 py-3 ${
          allPassed
            ? 'border-emerald-500/25 bg-emerald-500/10'
            : 'border-rose-500/25 bg-rose-500/10'
        }`}
      >
        <span
          aria-hidden
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
            allPassed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
          }`}
        >
          {allPassed ? '✓' : '✗'}
        </span>
        <p className={`text-sm font-bold ${allPassed ? 'text-emerald-300' : 'text-rose-300'}`}>
          {allPassed ? '모든 테스트 통과' : '오답'}
          <span className="dc-num ml-2 font-mono text-[12px] font-medium text-fg-on-dark-secondary">
            ({passed} / {total} 통과)
          </span>
        </p>
      </div>

      {/* ② 케이스 선택 탭 — 통과 여부를 아이콘으로 함께 보여 준다 */}
      <div
        role="tablist"
        aria-label="테스트 케이스"
        className="dc-scroll-none flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/10 px-2"
      >
        {results.map((r, i) => {
          const on = i === active;
          const s = STATUS[r.status];
          return (
            <button
              key={r.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(i)}
              className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 font-mono text-[12px] transition-colors duration-[var(--duration-state)] ${
                on
                  ? 'border-brand-400 font-bold text-brand-300'
                  : 'border-transparent text-fg-on-dark-muted hover:text-fg-on-dark-secondary'
              }`}
            >
              <span aria-hidden className={s.className}>
                {s.mark}
              </span>
              Case {i + 1}
              {r.isHidden && (
                <span aria-label="히든 케이스" className="text-fg-on-dark-quiet">
                  🔒
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ③ 고른 케이스의 상세 */}
      <div className="dc-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <p className="flex items-center gap-2 text-[12px]">
          <span className={`font-semibold ${st.className}`}>
            {st.mark} Case {active + 1} · {st.label}
          </span>
          <span className="dc-num font-mono text-[11px] text-slate-500">{current.timeMs}ms</span>
        </p>

        {current.isHidden ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-white/15 px-4 py-6 text-center text-xs leading-relaxed text-fg-on-dark-quiet">
            히든 케이스입니다. 입력과 기대값은 공개하지 않습니다 — 몇 번 틀려 보는 것만으로 케이스를
            복원할 수 없게 하기 위해서입니다.
            <br />
            결과는 <span className={st.className}>{st.label}</span>입니다.
          </p>
        ) : (
          <>
            <Field
              label="입력값"
              value={(() => {
                const args = argsById.get(current.id);
                return args ? args.map((a) => fmt(a)).join(', ') : '(입력값을 불러오지 못했습니다)';
              })()}
            />
            <Field label="기대값" value={fmt(current.expected)} tone="ok" />
            <Field
              label="실제 출력값"
              value={
                current.status === 'error'
                  ? (current.errorMessage ?? '실행 중 오류가 발생했습니다')
                  : current.status === 'timeout'
                    ? `시간 초과 — 실행이 중단되었습니다 (${current.timeMs}ms)`
                    : fmt(current.actual)
              }
              tone={current.status === 'pass' ? 'ok' : 'bad'}
            />
            {current.stdout && <Field label="표준 출력 (stdout)" value={current.stdout} />}
            <Field label="실행 시간" value={`${current.timeMs}ms`} />
          </>
        )}
      </div>
    </div>
  );
}
