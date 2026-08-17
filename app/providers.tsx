'use client';

// 다크 전용 서비스 — 테마 프로바이더 없이 언어 컨텍스트만 제공한다.
// SessionRefresher는 proxy.ts 제거 후 세션 쿠키를 백그라운드로 갱신한다.
import { LanguageProvider } from './context/language-context';
import SessionRefresher from './components/session-refresher';

interface Props {
  children: React.ReactNode;
}

export default function Providers({ children }: Props) {
  return (
    <LanguageProvider>
      <SessionRefresher />
      {children}
    </LanguageProvider>
  );
}
