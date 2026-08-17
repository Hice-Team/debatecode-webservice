'use client';

import type { CaseResult } from '@/app/lib/types';

const STATUS_STYLE: Record<CaseResult['status'], { label: string; className: string }> = {
  pass: { label: 'PASS', className: 'text-emerald-400' },
  fail: { label: 'FAIL', className: 'text-rose-400' },
  error: { label: 'ERROR', className: 'text-rose-400' },
  timeout: { label: 'TIMEOUT', className: 'text-brand-400' },
};

function fmt(v: unknown): string {
  const s = JSON.stringify(v);
  return s && s.length > 60 ? s.slice(0, 60) + '…' : s ?? 'undefined';
}

export default function TestResults({ results, total }: { results: CaseResult[]; total: number }) {
  if (results.length === 0) {
    return (
      <div className="p-4 font-mono text-xs text-white/30">
        실행 버튼을 누르면 테스트 케이스 결과가 여기에 표시됩니다.
      </div>
    );
  }

  return (
    <div className="font-mono text-xs">
      <div className="grid grid-cols-[70px_80px_70px_1fr] gap-2 px-4 py-2 border-b border-white/10 text-white/40 text-[10px] tracking-wider">
        <span>CASE</span>
        <span>STATUS</span>
        <span>TIME</span>
        <span>DETAIL</span>
      </div>
      {results.map((r, i) => {
        const st = STATUS_STYLE[r.status];
        return (
          <div
            key={r.id}
            className="grid grid-cols-[70px_80px_70px_1fr] gap-2 px-4 py-2 border-b border-white/5 items-start"
          >
            <span className="text-white/50">#{i + 1}{r.isHidden && <span className="text-white/25"> 🔒</span>}</span>
            <span className={st.className}>{st.label}</span>
            <span className="text-white/40">{r.timeMs}ms</span>
            <span className="text-white/60 break-all">
              {r.status === 'pass' && !r.isHidden && <>→ {fmt(r.actual)}</>}
              {r.status === 'pass' && r.isHidden && <span className="text-white/30">히든 케이스 통과</span>}
              {r.status === 'fail' &&
                (r.isHidden ? (
                  <span className="text-white/40">히든 케이스 불일치</span>
                ) : (
                  <>
                    기대 <span className="text-emerald-300/80">{fmt(r.expected)}</span> / 실제{' '}
                    <span className="text-rose-300/80">{fmt(r.actual)}</span>
                  </>
                ))}
              {r.status === 'error' && <span className="text-rose-300/80">{r.errorMessage}</span>}
              {r.status === 'timeout' && <span className="text-brand-300/80">시간 초과 — 무한 루프 여부를 확인하세요</span>}
              {r.stdout && !r.isHidden && (
                <span className="block text-white/30 mt-0.5">stdout: {r.stdout.slice(0, 120)}</span>
              )}
            </span>
          </div>
        );
      })}
      <div className="px-4 py-2.5 text-white/50">
        {results.filter((r) => r.status === 'pass').length} / {total} 통과
      </div>
    </div>
  );
}
