'use client';

// 세트 구성 편집 — 문제 검색·추가, 순서 이동, 제거.
// 문제 목록은 서버에서 전부 받아 클라이언트에서 필터링한다(문제 은행 규모가 크지 않다).
import { useMemo, useState, useTransition } from 'react';
import { addProblemToSet, moveProblemInSet, removeProblemFromSet } from '@/app/lib/actions/problem-sets';
import { DIFFICULTY_LABELS } from '@/app/lib/types';
import { BTN_NEUTRAL } from '../ui';

interface ProblemOption {
  id: number;
  title: string;
  difficulty: number;
  category: string;
  company: string | null;
}

interface Item {
  id: string;
  order: number;
  problem: { id: number; title: string; difficulty: number; category: string };
}

export default function SetItemsEditor({
  setId,
  items,
  problems,
}: {
  setId: number;
  items: Item[];
  problems: ProblemOption[];
}) {
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();

  const includedIds = useMemo(() => new Set(items.map((i) => i.problem.id)), [items]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return problems
      .filter((p) => !includedIds.has(p.id))
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.company ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [problems, includedIds, query]);

  const run = (action: (fd: FormData) => Promise<void>, fields: Record<string, string | number>) =>
    startTransition(async () => {
      const fd = new FormData();
      for (const [key, value] of Object.entries(fields)) fd.set(key, String(value));
      await action(fd);
    });

  return (
    <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-ink/[0.07]">
      {/* 편성된 문제 */}
      <div className="p-5">
        <h4 className="mb-3 text-sm font-bold text-ink">
          편성된 문제 <span className="font-mono text-xs text-ink-soft/40">{items.length}</span>
        </h4>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-ink-soft/45">
            오른쪽에서 문제를 추가해 세트를 구성하세요.
          </p>
        ) : (
          <ol className="space-y-1.5">
            {items.map((item, index) => (
              <li key={item.id} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/[0.06] font-mono text-[11px] font-bold text-ink-soft/50">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.problem.title}</p>
                  <p className="truncate font-mono text-[10px] text-ink-soft/40">
                    {item.problem.category} · {DIFFICULTY_LABELS[item.problem.difficulty]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={pending || index === 0}
                    onClick={() => run(moveProblemInSet, { itemId: item.id, direction: 'up' })}
                    aria-label="위로"
                    className="grid h-7 w-7 place-items-center rounded-lg border border-ink/12 text-ink-soft/60 hover:border-brand-300 hover:text-signal disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || index === items.length - 1}
                    onClick={() => run(moveProblemInSet, { itemId: item.id, direction: 'down' })}
                    aria-label="아래로"
                    className="grid h-7 w-7 place-items-center rounded-lg border border-ink/12 text-ink-soft/60 hover:border-brand-300 hover:text-signal disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(removeProblemFromSet, { itemId: item.id })}
                    aria-label="제거"
                    className="grid h-7 w-7 place-items-center rounded-lg border border-ink/12 text-rose-600 hover:border-rose-300 disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* 문제 추가 */}
      <div className="border-t border-ink/[0.07] p-5 lg:border-t-0">
        <h4 className="mb-3 text-sm font-bold text-ink">문제 추가</h4>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목·카테고리·기업으로 검색"
          className="mb-3 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
        />
        {candidates.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft/45">
            {query ? '검색 결과가 없습니다.' : '추가할 수 있는 문제가 없습니다.'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {candidates.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-xl border border-ink/10 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.title}</p>
                  <p className="truncate font-mono text-[10px] text-ink-soft/40">
                    {p.category} · {DIFFICULTY_LABELS[p.difficulty]}
                    {p.company ? ` · ${p.company}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(addProblemToSet, { setId, problemId: p.id })}
                  className={`${BTN_NEUTRAL} shrink-0 disabled:opacity-40`}
                >
                  추가
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
