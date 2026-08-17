'use client';

// 설정 셸 — 좌측 검색 + 카테고리, 우측 해당 카테고리의 설정 행.
//
// 예전에는 모든 섹션을 한 페이지에 세로로 쌓고 앵커로 이동했다. 항목이 늘면서 스크롤이 길어졌고,
// "이 설정이 어디 있더라"를 찾으려면 눈으로 훑어야 했다. 지금은 한 번에 한 갈래만 보여 주고,
// 어디에 있는지 모를 때는 검색으로 찾는다(라벨과 키워드를 함께 훑는다).
//
// 각 카테고리의 내용은 서버에서 만들어 prop으로 받는다 — 여기서는 무엇을 보여 줄지만 정한다.
import { useMemo, useState, type ReactNode } from 'react';

export interface SettingsCategory {
  id: string;
  label: string;
  /** 검색에 걸리게 할 항목 이름들 — 화면에 없는 동의어도 넣는다 */
  keywords: string[];
  icon: ReactNode;
}

export default function SettingsShell({
  categories,
  panels,
}: {
  categories: SettingsCategory[];
  /** 카테고리 id → 그 화면의 내용 */
  panels: Record<string, ReactNode>;
}) {
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const [query, setQuery] = useState('');

  const normalized = query.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!normalized) return categories;
    return categories.filter(
      (c) =>
        c.label.toLowerCase().includes(normalized) ||
        c.keywords.some((k) => k.toLowerCase().includes(normalized)),
    );
  }, [categories, normalized]);

  // 검색으로 걸러진 목록에 지금 카테고리가 없으면 첫 결과로 옮겨 준다
  const shown = matched.some((c) => c.id === active) ? active : (matched[0]?.id ?? active);
  const current = categories.find((c) => c.id === shown);

  return (
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
      {/* ---------- 좌: 검색 + 카테고리 ---------- */}
      <aside className="sticky top-20 self-start max-h-[calc(100vh-5rem)] overflow-auto pr-1">
        <div className="relative mb-3">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-none stroke-ink-soft/35 stroke-2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="설정 검색"
            placeholder="설정 검색"
            className="w-full rounded-full border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-ink-soft/35 focus:border-signal/40 focus:outline-none focus:ring-2 focus:ring-signal/20"
          />
        </div>

        <nav aria-label="설정 분류" className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {matched.map((c) => {
            const on = c.id === shown;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setActive(c.id)}
                aria-current={on ? 'true' : undefined}
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                  on ? 'bg-ink/[0.06] font-semibold text-ink' : 'text-ink-soft/65 hover:bg-ink/[0.03] hover:text-ink'
                }`}
              >
                <span aria-hidden className={on ? 'text-signal' : 'text-ink-soft/45'}>
                  {c.icon}
                </span>
                {c.label}
              </button>
            );
          })}
          {matched.length === 0 && (
            <p className="px-3 py-6 text-sm text-ink-soft/40">일치하는 설정이 없습니다.</p>
          )}
        </nav>
      </aside>

      {/* ---------- 우: 선택한 카테고리 ---------- */}
      <section aria-live="polite" className="min-w-0">
        {current && (
          <>
            <h2 className="border-b border-ink/10 pb-3 font-display text-xl font-bold tracking-tight text-ink">
              {current.label}
            </h2>
            <div className="pt-1">{panels[current.id]}</div>
          </>
        )}
      </section>
    </div>
  );
}
