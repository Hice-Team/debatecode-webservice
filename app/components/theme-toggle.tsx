'use client';

// 라이트/다크 전환 — 언어 선택 옆에 놓인다.
//
// 세 가지 상태를 돈다: 시스템 → 라이트 → 다크 → 시스템.
// "시스템"이 기본값인 이유는, OS를 다크로 써 온 사람에게 이 서비스만 밝게 뜨는 것이
// 설정을 안 한 벌처럼 느껴지기 때문이다. 고르면 그 선택이 OS보다 우선한다.
//
// 실제 색 전환은 CSS 토큰이 한다(app/globals.css의 [data-theme] 블록).
// 이 컴포넌트가 하는 일은 <html>에 data-theme을 쓰고 localStorage에 남기는 것뿐이다.
import { useSyncExternalStore } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { THEME_ORDER, applyTheme, readTheme, subscribeTheme, type ThemeChoice } from '@/app/lib/theme';

const ICON = 'h-[18px] w-[18px] fill-none stroke-current stroke-[1.7]';

/** 상태마다 다른 그림 — 글자 없이도 지금이 무엇인지 알 수 있어야 한다. */
function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  if (choice === 'light') {
    return (
      <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (choice === 'dark') {
    return (
      <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
        <path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4Z" strokeLinejoin="round" />
      </svg>
    );
  }
  // 시스템 — 반은 밝고 반은 어두운 원
  return (
    <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 3.8a8.2 8.2 0 0 1 0 16.4Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { language } = useLanguage();
  // 서버 스냅샷은 'system' — 첫 렌더가 어긋나지 않는다.
  const choice = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as ThemeChoice);

  const label = t(`theme-${choice}`, language);
  const next = THEME_ORDER[(THEME_ORDER.indexOf(choice) + 1) % THEME_ORDER.length];

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`${t('theme-label', language)}: ${label}`}
      title={`${t('theme-label', language)}: ${label}`}
      className="dc-tap grid h-9 w-9 place-items-center rounded-full text-fg-muted transition-colors hover:bg-paper hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      <ThemeIcon choice={choice} />
    </button>
  );
}
