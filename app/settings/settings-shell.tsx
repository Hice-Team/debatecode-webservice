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
            className="w-full rounded-[var(--radius-card)] border border-hairline bg-surface py-2.5 pl-9 pr-3 text-sm placeholder:text-fg-quiet focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
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
                // Liner식 — 선택 상태를 회색이 아니라 브랜드 틴트로 표시한다.
                // 회색 선택은 "비활성"으로도 읽혀서, 지금 어느 화면인지 한눈에 안 들어온다.
                // 좁은 화면에서는 가로 탭이 되므로 pill, 넓은 화면에서는 목록이라 8px.
                className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2.5 text-sm transition-colors md:rounded-[var(--radius-card)] ${
                  on
                    ? 'bg-brand-50 font-semibold text-signal'
                    : 'text-fg-secondary hover:bg-paper hover:text-fg'
                }`}
              >
                <span aria-hidden className={on ? 'text-signal' : 'text-fg-muted'}>
                  {c.icon}
                </span>
                {c.label}
              </button>
            );
          })}
          {matched.length === 0 && (
            <p className="px-3 py-6 text-sm text-fg-quiet">일치하는 설정이 없습니다.</p>
          )}
        </nav>
      </aside>

      {/* ---------- 우: 선택한 카테고리 ---------- */}
      <section aria-live="polite" className="min-w-0">
        {current && (
          <>
            {/* 제목 아래에 그 갈래가 무엇을 다루는지 한 줄 — 항목 이름만으로는
                "여기서 무엇을 바꿀 수 있는지" 알기 어렵다. */}
            <div className="border-b border-hairline pb-4">
              <h2 className="font-display text-xl font-bold tracking-tight text-fg">{current.label}</h2>
              {current.keywords.length > 0 && (
                <p className="mt-1 text-[13px] text-fg-muted">
                  {current.keywords.slice(0, 4).join(' · ')}
                </p>
              )}
            </div>
            <div className="pt-2">{panels[current.id]}</div>
          </>
        )}
      </section>
    </div>
  );
}
