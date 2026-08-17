'use client';

// 스크롤 시 헤더를 알약(pill) 형태로 전환하는 클라이언트 프레임.
// 세션 조회 등 서버 로직은 nav.tsx(서버 컴포넌트)에 두고, 여기서는 형태 전환만 담당한다.
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

export default function NavFrame({ children }: { children: React.ReactNode }) {
  const pill = useSyncExternalStore(
    subscribe,
    () => window.scrollY > 32,
    () => false,
  );

  return (
    <div className="sticky top-0 z-50">
      <nav
        className={`mx-auto border transition-all duration-300 ease-out ${
          pill
            ? 'mt-3 max-w-4xl rounded-full bg-white/85 backdrop-blur-xl border-ink/10 shadow-xl shadow-ink/[0.08]'
            : 'mt-0 max-w-full rounded-none bg-white/90 backdrop-blur border-x-transparent border-t-transparent border-b-ink/[0.06]'
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-300 ease-out ${
            pill ? 'h-13 px-5 sm:px-6' : 'h-16 px-6 sm:px-8 max-w-7xl mx-auto'
          }`}
        >
          {children}
        </div>
      </nav>
    </div>
  );
}
