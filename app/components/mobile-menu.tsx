'use client';

// 모바일(md 미만) 전용 햄버거 메뉴. 서버 로직(세션/로그아웃)은 nav.tsx에서 슬롯으로 주입받는다.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import LanguageSwitcher from './language-switcher';
import ThemeToggle from './theme-toggle';

interface Props {
  links: readonly { href: string; key: string; label: string }[];
  authSlot: React.ReactNode;
}

export default function MobileMenu({ links, authSlot }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();

  // 페이지 이동 시 자동으로 닫기 — 렌더 중 상태 보정 패턴 (effect 불필요)
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? t('close-menu', language) : t('open-menu', language)}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-fg hover:bg-paper transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 mx-3 rounded-[var(--radius-panel)] border border-hairline bg-surface/95 backdrop-blur-xl p-4 shadow-2xl shadow-ink/15 z-50">
          <ul className="space-y-1">
            {links.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-fg-secondary hover:bg-paper hover:text-fg transition-colors"
                >
                  {t(m.key, language)}
                </Link>
              </li>
            ))}
          </ul>

          {/* 사용자 인증 섹션 */}
          <div className="mt-4 border-t border-hairline pt-4 flex flex-col gap-2">{authSlot}</div>

          {/* 언어 및 테마 전환 섹션 */}
          <div className="mt-4 border-t border-hairline pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-muted">Language</span>
              <LanguageSwitcher align="right" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg-muted">{t('theme-label', language)}</span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
