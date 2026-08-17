'use client';

// KO/EN 전환 버튼 — 언어 컨텍스트에 연결되어 클릭 즉시 전체 렌더링이 전환된다.
import { useLanguage } from '@/app/context/language-context';

export default function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'ko' ? 'en' : 'ko')}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-soft/65 hover:bg-ink/5 transition-colors text-sm font-medium"
      title={language === 'ko' ? 'Switch to English' : '한국어로 전환'}
    >
      {language === 'ko' ? 'EN' : 'KO'}
    </button>
  );
}
