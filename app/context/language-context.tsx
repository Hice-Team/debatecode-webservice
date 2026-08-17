'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Language } from '@/app/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // SSR과 첫 클라이언트 렌더는 'ko'로 일치시키고, 마운트 후 저장된 언어를 반영한다.
  const [language, setLanguageState] = useState<Language>('ko');

  useEffect(() => {
    const saved = localStorage.getItem('language');
    if (saved === 'ko' || saved === 'en') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 복원은 하이드레이션 후에만 가능
      setLanguageState(saved);
    }
  }, []);

  // 스크린리더/번역기용 문서 언어 동기화
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    return { language: 'ko' as const, setLanguage: () => {} };
  }
  return context;
}
