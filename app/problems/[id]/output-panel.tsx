'use client';

// 에디터 하단 출력 패널 — [테스트 결과] 채점 T/F 표와 [터미널] 원본 실행 출력을 탭으로 전환한다.
import { useMemo, useState } from 'react';
import type { CaseResult } from '@/app/lib/types';
import TestResults from './test-results';
import TerminalView from './terminal-view';

type OutputTab = 'tests' | 'terminal';

const TAB_LABELS: Record<OutputTab, string> = { tests: '테스트 결과', terminal: '터미널' };

export default function OutputPanel({
  results,
  total,
  cases,
}: {
  results: CaseResult[];
  total: number;
  /** 예제 케이스만 들어온다 — 히든 케이스의 입력은 브라우저에 오지 않는다 */
  cases: Array<{ id: number; args: unknown[] }>;
}) {
  const [tab, setTab] = useState<OutputTab>('tests');
  const argsById = useMemo(() => new Map(cases.map((c) => [c.id, c.args])), [cases]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center border-b border-white/10 px-2 text-[10px] font-semibold tracking-wider" role="tablist">
        {(Object.keys(TAB_LABELS) as OutputTab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 transition-colors ${
              tab === t ? 'border-b-2 border-brand-400 text-brand-400' : 'text-fg-on-dark-quiet hover:text-fg-on-dark-secondary'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="dc-scroll min-h-0 flex-1 overflow-y-auto">
        {tab === 'tests' ? <TestResults results={results} total={total} /> : <TerminalView results={results} argsById={argsById} />}
      </div>
    </div>
  );
}
