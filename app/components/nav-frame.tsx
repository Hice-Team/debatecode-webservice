'use client';

// 스크롤 시 헤더를 알약(pill) 형태로 전환하는 클라이언트 프레임.
// 세션 조회 등 서버 로직은 nav.tsx(서버 컴포넌트)에 두고, 여기서는 형태 전환만 담당한다.
import { useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { isSolveWorkspace } from '@/app/lib/solve-route';

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

  // 코드 에디터는 잉크 캔버스다. 그 위에 흰 내비게이션이 얹히면 작업 화면이 거기서 잘려
  // 보인다 — 워크스페이스에서는 좌측 패널과 같은 표면색(#12141C)으로 맞춘다.
  // 알약 전환도 하지 않는다. 작업 중에 헤더 모양이 바뀌면 그것부터 눈에 들어온다.
  const onSolve = isSolveWorkspace(usePathname());

  if (onSolve) {
    return (
      <div className="sticky top-0 z-50">
        <nav className="dc-nav-dark mx-auto max-w-full border border-x-transparent border-t-transparent border-b-white/10 bg-[#12141C]">
          <div className="mx-auto flex h-12 max-w-full items-center justify-between px-4 sm:px-6">{children}</div>
        </nav>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-50">
      <nav
        className={`mx-auto border transition-colors duration-300 ease-out ${
          pill
            ? 'mt-3 max-w-4xl rounded-full bg-white/85 backdrop-blur-xl border-hairline shadow-xl shadow-ink/[0.08]'
            : 'mt-0 max-w-full rounded-none bg-white/90 backdrop-blur border-x-transparent border-t-transparent border-b-ink/[0.06]'
        }`}
      >
        <div
          className={`flex items-center justify-between transition-colors duration-300 ease-out ${
            pill ? 'h-13 px-5 sm:px-6' : 'h-16 px-6 sm:px-8 max-w-7xl mx-auto'
          }`}
        >
          {children}
        </div>
      </nav>
    </div>
  );
}
