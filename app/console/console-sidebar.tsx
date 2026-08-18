'use client';

// 관리 콘솔 사이드바 — 좌측 고정 내비게이션(데스크톱) / 상단 가로 스크롤 칩(모바일).
// 현재 경로 기준 활성 하이라이트 + 처리 대기 건수 배지 + 하단 접속자 카드.
//
// 항목이 20개를 넘으면서 평평한 목록으로는 무엇이 어디 있는지 찾을 수 없게 됐다.
// 다섯 묶음(운영/콘텐츠/접근제어/성장/시스템)으로 나누고, 각 묶음을 접을 수 있게 했다.
// 접힌 상태는 localStorage에 남긴다 — 매번 같은 묶음을 다시 접는 일이 없도록.
import { useMemo, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

export type SidebarGroup = 'operations' | 'content' | 'access' | 'growth' | 'system';

// 사이드바 항목 — 라벨은 사전 키로만 넘긴다. 서버 레이아웃이 한국어/영어를 고르지 않고,
// 화면이 이용자의 언어 설정을 보고 정한다(글로벌화).
export interface SidebarItem {
  href: string;
  /** i18n 키 (console-nav-*) */
  labelKey: string;
  icon: string; // ICONS 키
  count?: number; // 대기 건수 — 표시하면 배지, >0이면 강조
  /** 묶음 헤딩 — 같은 group끼리 이어서 그린다 */
  group: SidebarGroup;
  /** 하위 경로까지 활성으로 볼지 (기본 true). /console 같은 접두 경로는 false */
  exact?: boolean;
}

// 사이드바 아이콘 (16x16, stroke=currentColor)
const ICONS: Record<string, React.ReactNode> = {
  overview: <path d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm7 0h5v5H9V9Z" strokeWidth="1.4" fill="none" />,
  review: (
    <path d="M3 1.5h10v13H3v-13Zm2.5 3.5h5m-5 3h5m-5 3h3M10.5 11l1.2 1.2 2-2.2" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  mate: (
    <path d="M6.5 8a2.75 2.75 0 1 0 0-5.5A2.75 2.75 0 0 0 6.5 8Zm-5 6.5c0-2.5 2.2-4 5-4s5 1.5 5 4M12.5 5.5v4M14.5 7.5h-4" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  ),
  report: (
    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 5v3.5M8 11h.01" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  ),
  inquiry: (
    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6 6a2 2 0 1 1 3 1.7c-.6.4-1 .7-1 1.3M8 11.2h.01" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  ),
  drafts: (
    <path d="M2 4.5 8 8l6-3.5M2 4.5v7L8 15l6-3.5v-7M2 4.5 8 1l6 3.5" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  upload: (
    <path d="M8 11V2.5m0 0L5 5.5m3-3 3 3M2.5 10v3a1.5 1.5 0 0 0 1.5 1.5h8a1.5 1.5 0 0 0 1.5-1.5v-3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  members: (
    <path d="M6 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm-4.5 7c0-2.3 2-3.8 4.5-3.8s4.5 1.5 4.5 3.8M12.5 8.5l.4 1 1.1.1-.8.8.2 1.1-1-.5-1 .5.2-1.1-.8-.8 1.1-.1.4-1Z" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  sets: (
    <path d="M2.5 3.5h5v9h-5v-9Zm6 0h5v9h-5v-9ZM2.5 6h5m1 0h5m-6 3h5m-11 0h5" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  points: (
    <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.2 6.2h2.4a1.4 1.4 0 0 1 0 2.8H6.2V6.2Zm0 2.8v2.8" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  shop: (
    <path d="M2.5 5.5h11l-.8 8a1.5 1.5 0 0 1-1.5 1.4H4.8a1.5 1.5 0 0 1-1.5-1.4l-.8-8ZM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  marketing: (
    <path d="M1.8 5.5h12.4v8H1.8v-8Zm0 .4 6.2 4.3 6.2-4.3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  popup: (
    <path d="M13.5 2.5v7l-3-1.5H5A2.5 2.5 0 0 1 5 3h5.5l3-.5ZM5 8v5M3.5 13h3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  // 접근 제어
  access: (
    <path d="M8 1.5 3 3.5v4c0 3.2 2.1 6 5 7 2.9-1 5-3.8 5-7v-4l-5-2Zm-2 6.5 1.5 1.5L10.5 6.5" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  roles: (
    <path d="M2.5 2.5h11v11h-11v-11Zm0 3.7h11m-11 3.6h11M6.1 2.5v11" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  sanction: (
    <path d="M8 1.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 8 1.8Zm-4 10.2 8-8" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  ),
  audit: (
    <path d="M3 1.5h7l3 3v10H3v-13Zm7 0v3h3M5.5 8h5m-5 2.5h5" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  // 시스템
  system: (
    <path d="M2 8h3l1.5-4 3 8L11 8h3" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  settings: (
    <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5.5-2c0-.4 0-.8-.1-1.2l1.3-1-1.5-2.6-1.5.6a5.6 5.6 0 0 0-2-1.2L9.4 1H6.6l-.3 1.6c-.7.3-1.4.7-2 1.2l-1.5-.6L1.3 5.8l1.3 1a6 6 0 0 0 0 2.4l-1.3 1 1.5 2.6 1.5-.6c.6.5 1.3.9 2 1.2l.3 1.6h2.8l.3-1.6c.7-.3 1.4-.7 2-1.2l1.5.6 1.5-2.6-1.3-1c.1-.4.1-.8.1-1.2Z" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
  maintenance: (
    <path d="M10.4 2.2a3.4 3.4 0 0 0-4.2 4.4l-4 4a1.4 1.4 0 0 0 2 2l4-4a3.4 3.4 0 0 0 4.4-4.2l-2 2-1.6-.4-.4-1.6 2-2Z" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  ),
};

function ItemBadge({ count, label }: { count: number; label: string }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
        count > 0 ? 'bg-rose-600 text-white' : 'bg-ink/5 text-ink-soft/45'
      }`}
      aria-label={`${label} ${count}`}
    >
      {count}
    </span>
  );
}

const GROUP_ORDER: SidebarGroup[] = ['operations', 'content', 'access', 'growth', 'system'];

const COLLAPSE_STORAGE_KEY = 'dc.console.collapsedGroups';


/* ---------- 묶음 접힘 상태 (localStorage) ---------- */

const COLLAPSE_EVENT = 'dc:console-collapse';

// 스냅샷은 반드시 같은 문자열을 돌려줘야 한다 — 매번 새 값을 만들면 무한 렌더가 된다.
let collapseSnapshot = '[]';

function readCollapse(): string {
  try {
    collapseSnapshot = window.localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '[]';
  } catch {
    // 저장소를 못 읽으면 전부 펼친 기본 상태로 동작한다
  }
  return collapseSnapshot;
}

function subscribeCollapse(onChange: () => void): () => void {
  // 같은 탭의 변경(커스텀 이벤트)과 다른 탭의 변경(storage)을 모두 듣는다
  window.addEventListener(COLLAPSE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function writeCollapse(groups: SidebarGroup[]): void {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // 저장 실패는 이번 세션에만 영향
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

export default function ConsoleSidebar({
  items,
  userName,
  roleName,
  maintenanceOn,
}: {
  items: SidebarItem[];
  userName: string;
  roleName: string;
  /** 유지보수 모드가 켜져 있으면 사이드바 상단에 상시 경고를 띄운다 */
  maintenanceOn?: boolean;
}) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const pendingLabel = t('console-pending-aria', language);

  // 접힘 상태는 localStorage(=React 밖의 저장소)에 산다. useEffect로 읽어 setState하면
  // 첫 렌더 직후 한 번 더 렌더되고, 린트 규칙(set-state-in-effect)에도 걸린다.
  // useSyncExternalStore는 외부 저장소를 읽는 정식 경로라 그 왕복이 없다.
  const raw = useSyncExternalStore(subscribeCollapse, readCollapse, () => '[]');
  const collapsed = useMemo<Set<SidebarGroup>>(() => {
    try {
      return new Set(JSON.parse(raw) as SidebarGroup[]);
    } catch {
      return new Set();
    }
  }, [raw]);

  const toggleGroup = (group: SidebarGroup) => {
    const next = new Set(collapsed);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    writeCollapse([...next]);
  };

  const isActive = (item: SidebarItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <>
      {/* 모바일: 가로 스크롤 칩 — 묶음 없이 한 줄로 흐른다 */}
      <nav
        aria-label={t('console-menu-aria', language)}
        className="dc-scroll-none lg:hidden sticky top-0 z-10 overflow-x-auto border-b border-ink/10 bg-white/95 px-4 py-2 backdrop-blur"
      >
        {maintenanceOn && (
          <p className="mb-2 rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900">
            {t('console-maintenance-live', language)}
          </p>
        )}
        <div className="flex w-max gap-1.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive(item) ? 'bg-signal text-white' : 'text-ink-soft/70 hover:bg-paper hover:text-ink'
              }`}
            >
              {t(item.labelKey, language)}
              {item.count != null && <ItemBadge count={item.count} label={pendingLabel} />}
            </Link>
          ))}
        </div>
      </nav>

      {/* 데스크톱: 좌측 고정 레일 */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-ink/10 bg-white lg:sticky lg:top-0 lg:h-screen">
        <div className="px-6 pb-4 pt-7">
          <p className="text-lg font-bold text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {t('console-title', language)}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft/55">{t('console-sub', language)}</p>
        </div>

        {/* 유지보수 경고 — 켜 두고 잊는 사고가 제일 흔해서 늘 보이는 자리에 둔다 */}
        {maintenanceOn && (
          <Link
            href="/console/system/maintenance"
            className="mx-3 mb-2 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-900 hover:bg-amber-100"
          >
            <span aria-hidden className="mt-0.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-600" />
            {t('console-maintenance-live', language)}
          </Link>
        )}

        <nav aria-label={t('console-menu-aria', language)} className="flex-1 overflow-y-auto px-3 pb-3">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;

            const isCollapsed = collapsed.has(group);
            // 접혀 있어도 그 안에 처리할 건이 있으면 헤딩에 합계를 띄운다 — 접었다는 이유로
            // 대기 건을 놓치면 접기 기능이 오히려 해가 된다
            const pendingInGroup = groupItems.reduce((sum, item) => sum + (item.count ?? 0), 0);

            return (
              <div key={group} className="mt-4 first:mt-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!isCollapsed}
                  aria-label={`${t(`console-group-${group}`, language)} — ${t('console-group-toggle', language)}`}
                  className="flex w-full items-center gap-1.5 rounded-lg px-3.5 pb-1.5 pt-1 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft/35 hover:text-ink-soft/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                >
                  <span aria-hidden className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                    ▾
                  </span>
                  <span className="flex-1">{t(`console-group-${group}`, language)}</span>
                  {isCollapsed && pendingInGroup > 0 && (
                    <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {pendingInGroup}
                    </span>
                  )}
                </button>

                {!isCollapsed && (
                  <div className="space-y-1">
                    {groupItems.map((item) => {
                      const active = isActive(item);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
                            active ? 'bg-signal text-white shadow-sm shadow-brand-600/30' : 'text-ink-soft/75 hover:bg-paper hover:text-ink'
                          }`}
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" aria-hidden className="shrink-0">
                            {ICONS[item.icon]}
                          </svg>
                          <span className="flex-1 truncate">{t(item.labelKey, language)}</span>
                          {item.count != null && <ItemBadge count={item.count} label={pendingLabel} />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* 하단 접속자 카드 */}
        <div className="border-t border-ink/10 p-4">
          <div className="flex items-center gap-3 rounded-xl bg-paper/80 px-3.5 py-3">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-signal text-xs font-bold text-white">
              {(userName[0] ?? 'A').toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{userName}</p>
              <p className="flex items-center gap-1.5 font-mono text-[10px] text-ink-soft/50">
                {roleName}
                <span aria-hidden className="h-1 w-1 rounded-full bg-emerald-500" />
                Active
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
