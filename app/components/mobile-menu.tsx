'use client';

// 모바일(md 미만) 전용 햄버거 메뉴. 서버 로직(세션/로그아웃)은 nav.tsx에서 슬롯으로 주입받는다.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

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

          {/* 언어 전환 섹션 */}
          <div className="mt-4 border-t border-hairline pt-4">
            <button
              onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')}
              className="flex w-full items-center justify-center gap-2 px-3 py-2.5 bg-paper hover:bg-paper rounded-lg transition-colors text-sm font-medium text-fg-secondary hover:text-fg"
              title={language === 'ko' ? 'Switch to English' : '한국어로 전환'}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span>{language === 'ko' ? 'English' : '한국어'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
