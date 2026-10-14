'use client';

// 라이트/다크 즉시 전환 — 중간 단계(system 순환) 없이 1클릭으로 라이트↔다크 전환
import { useSyncExternalStore } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { getEffectiveTheme, readTheme, subscribeTheme, toggleTheme, type ThemeChoice } from '@/app/lib/theme';

const ICON = 'h-[18px] w-[18px] fill-none stroke-current stroke-[1.7]';

function ThemeIcon({ theme }: { theme: 'light' | 'dark' }) {
  if (theme === 'light') {
    return (
      <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4Z" strokeLinejoin="round" />
    </svg>
  );
}

export default function ThemeToggle({ className }: { className?: string }) {
  const { language } = useLanguage();
  const choice = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as ThemeChoice);
  const effective = getEffectiveTheme(choice);
  const targetTheme = effective === 'dark' ? 'light' : 'dark';
  const label = t(`theme-${targetTheme}`, language);

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      aria-label={`${t('theme-label', language)}: ${label}`}
      title={`${t('theme-label', language)}: ${label}`}
      className={className ?? "dc-tap grid h-9 w-9 place-items-center rounded-full text-fg-muted transition-colors hover:bg-paper hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal cursor-pointer"}
    >
      <ThemeIcon theme={effective} />
    </button>
  );
}

