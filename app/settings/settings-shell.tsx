'use client';

// 설정 셸 — 좌측 검색 + 카테고리, 우측 해당 카테고리의 설정 행.
//
// 예전에는 모든 섹션을 한 페이지에 세로로 쌓고 앵커로 이동했다. 항목이 늘면서 스크롤이 길어졌고,
// "이 설정이 어디 있더라"를 찾으려면 눈으로 훑어야 했다. 지금은 한 번에 한 갈래만 보여 주고,
// 어디에 있는지 모를 때는 검색으로 찾는다(라벨과 키워드를 함께 훑는다).
//
// 각 카테고리의 내용은 서버에서 만들어 prop으로 받는다 — 여기서는 무엇을 보여 줄지만 정한다.
//
// 어느 갈래를 보고 있는지는 주소(#해시)에 남는다. 예전에는 화면 안에서만 들고 있어서,
// `/settings#ai` 같은 링크로 들어와도 늘 첫 갈래가 열렸다 — 하위 페이지 네 곳과
// 가입 마지막 단계가 전부 그런 링크를 쓰고 있었으므로, 그 링크들이 통째로 엉뚱한 곳을
// 가리키고 있었다. 새로고침이나 뒤로 가기도 마찬가지였다.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import SettingsSaveBar, { useSaveBar } from './save-bar';

export interface SettingsCategory {
  id: string;
  label: string;
  /** 검색에 걸리게 할 항목 이름들 — 화면에 없는 동의어도 넣는다 */
  keywords: string[];
  icon: ReactNode;
  /**
   * 고르는 즉시 적용되는 갈래인가(저장 버튼이 없다).
   *
   * 구역마다 규칙이 다른데 화면에 아무 표시가 없으면, 바꿔 놓고 "저장했나?"를 매번
   * 다시 확인하게 된다. 접근성처럼 브라우저에 바로 쓰는 설정이 여기 해당한다.
   */
  instant?: boolean;
}

/* ---------- 주소와 갈래를 맞춘다 ---------- */

/** 주소의 #해시를 읽는다. 서버에는 해시가 오지 않으므로 스냅샷을 나눠 둔다. */
function subscribeHash(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
function readHash(): string {
  try {
    return window.location.hash.replace(/^#/, '');
  } catch {
    return '';
  }
}

export default function SettingsShell({
  categories,
  panels,
}: {
  categories: SettingsCategory[];
  /** 카테고리 id → 그 화면의 내용 */
  panels: Record<string, ReactNode>;
}) {
  // 저장 바가 셸을 감싼다 — 카테고리를 옮길 때 "저장하지 않았다"를 붙잡아야 하는데,
  // 그 판단은 저장 바만 알고 있다.
  return (
    <SettingsSaveBar>
      <SettingsBody categories={categories} panels={panels} />
    </SettingsSaveBar>
  );
}

function SettingsBody({
  categories,
  panels,
}: {
  categories: SettingsCategory[];
  panels: Record<string, ReactNode>;
}) {
  const { confirmLeave } = useSaveBar();
  const [query, setQuery] = useState('');

  // 주소가 곧 상태다 — 새로고침·뒤로 가기·링크 공유가 저절로 된다
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const fallback = categories[0]?.id ?? '';
  const active = categories.some((c) => c.id === hash) ? hash : fallback;

  const go = useCallback(
    (id: string) => {
      // 저장하지 않은 변경이 있으면 먼저 묻는다 — 갈래를 옮기는 순간
      // 폼이 통째로 사라져서, 묻지 않으면 되돌릴 방법이 없다.
      if (!confirmLeave()) return;
      // pushState라 뒤로 가기로 이전 갈래에 돌아갈 수 있다. hashchange가 뒤따라
      // 발생하지 않으므로 직접 알린다.
      window.history.pushState(null, '', `#${id}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    },
    [confirmLeave],
  );

  // 알 수 없는 해시(#없음 · 오래된 링크)로 들어왔으면 주소를 첫 갈래로 바로잡는다.
  // 그대로 두면 주소와 화면이 어긋난 채로 남아 링크를 복사해 가도 같은 곳이 열리지 않는다.
  useEffect(() => {
    if (hash === active || !fallback) return;
    window.history.replaceState(null, '', `#${active}`);
  }, [hash, active, fallback]);

  const normalized = query.trim().toLowerCase();

  /** 검색어에 걸린 갈래와, **무엇 때문에 걸렸는지**(항목 이름)를 함께 돌려준다. */
  const matched = useMemo(() => {
    if (!normalized) return categories.map((c) => ({ category: c, hits: [] as string[] }));
    return categories
      .map((c) => ({
        category: c,
        // 걸린 항목만 추린다 — "왜 이 갈래가 나왔는지"를 보여 줘야 눌러 볼지 정할 수 있다
        hits: c.keywords.filter((k) => k.toLowerCase().includes(normalized)),
      }))
      .filter((r) => r.hits.length > 0 || r.category.label.toLowerCase().includes(normalized));
  }, [categories, normalized]);

  // 검색으로 걸러진 목록에 지금 갈래가 없으면 첫 결과를 보여 준다(주소는 건드리지 않는다 —
  // 검색은 훑어보는 중이고, 고른 것이 아니다)
  const shown = matched.some((r) => r.category.id === active)
    ? active
    : (matched[0]?.category.id ?? active);
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
          {matched.map(({ category: c, hits }) => {
            const on = c.id === shown;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => go(c.id)}
                aria-current={on ? 'true' : undefined}
                title={hits.length > 0 ? hits.join(' · ') : undefined}
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
                <span className="min-w-0 flex-1 truncate text-left">{c.label}</span>
                {/* 검색으로 걸린 항목 수 — 어느 갈래에 몇 개가 있는지 보고 고른다 */}
                {hits.length > 0 && (
                  <span className="shrink-0 rounded-full bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-signal">
                    {hits.length}
                  </span>
                )}
              </button>
            );
          })}
          {matched.length === 0 && (
            <p className="px-3 py-6 text-sm leading-relaxed text-fg-muted">
              「{query.trim()}」과(와) 일치하는 설정이 없습니다. 다른 낱말로 찾아보세요.
            </p>
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="font-display text-xl font-bold tracking-tight text-fg">{current.label}</h2>
                {/* 저장 규칙을 갈래마다 밝힌다 — 어디는 버튼을 눌러야 하고 어디는
                    고르는 즉시 적용된다는 것을 화면이 말해 주지 않으면 매번 확인하게 된다 */}
                <span className="rounded-full border border-hairline px-2 py-0.5 text-[11px] text-fg-muted">
                  {current.instant ? '고르는 즉시 적용' : '아래 저장 바에서 저장'}
                </span>
              </div>
              {current.keywords.length > 0 && (
                <p className="mt-1 text-[13px] text-fg-muted">
                  {current.keywords.slice(0, 5).join(' · ')}
                </p>
              )}
            </div>
            {/* 하단 저장 바가 마지막 행을 덮지 않도록 여백을 둔다 */}
            <div className="pb-24 pt-2">{panels[current.id]}</div>
          </>
        )}
      </section>
    </div>
  );
}
