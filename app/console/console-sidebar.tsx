'use client';

// 관리 콘솔 사이드바 — 좌측 고정 내비게이션(데스크톱) / 상단 가로 스크롤 칩(모바일).
// 현재 경로 기준 활성 하이라이트 + 처리 대기 건수 배지 + 하단 접속자 카드.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

// 사이드바 항목 — 라벨은 사전 키로만 넘긴다. 서버 레이아웃이 한국어/영어를 고르지 않고,
// 화면이 이용자의 언어 설정을 보고 정한다(글로벌화).
export interface SidebarItem {
  href: string;
  /** i18n 키 (console-nav-*) */
  labelKey: string;
  icon: string; // ICONS 키
  count?: number; // 대기 건수 — 표시하면 배지, >0이면 강조
  /** 묶음 헤딩 — 같은 group끼리 이어서 그린다 */
  group: 'operations' | 'content' | 'growth';
}

// 사이드바 아이콘 (16x16, stroke=currentColor)
const ICONS: Record<string, React.ReactNode> = {
  overview: (
    <path d="M2 2h5v5H2V2Zm7 0h5v5H9V2ZM2 9h5v5H2V9Zm7 0h5v5H9V9Z" strokeWidth="1.4" fill="none" />
  ),
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

const GROUP_ORDER = ['operations', 'content', 'growth'] as const;

export default function ConsoleSidebar({
  items,
  userName,
  roleName,
}: {
  items: SidebarItem[];
  userName: string;
  roleName: string;
}) {
  const pathname = usePathname();
  const { language } = useLanguage();
  const isActive = (href: string) => (href === '/console' ? pathname === '/console' : pathname.startsWith(href));
  const pendingLabel = t('console-pending-aria', language);

  return (
    <>
      {/* 모바일: 가로 스크롤 칩 — 묶음 없이 한 줄로 흐른다 */}
      <nav aria-label={t('console-menu-aria', language)} className="dc-scroll-none lg:hidden sticky top-0 z-10 overflow-x-auto border-b border-ink/10 bg-white/95 px-4 py-2 backdrop-blur">
        <div className="flex w-max gap-1.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive(item.href) ? 'bg-signal text-white' : 'text-ink-soft/70 hover:bg-paper hover:text-ink'
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

        {/* 묶음별로 나눈다 — 항목이 열 개를 넘기면서 평평한 목록으로는 무엇이 무엇인지 안 보였다 */}
        <nav aria-label={t('console-menu-aria', language)} className="flex-1 overflow-y-auto px-3 pb-3">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="mt-4 first:mt-0">
                <p className="px-3.5 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft/35">
                  {t(`console-group-${group}`, language)}
                </p>
                <div className="space-y-1">
                  {groupItems.map((item) => {
                    const active = isActive(item.href);
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
