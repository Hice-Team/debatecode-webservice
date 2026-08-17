'use client';

// 채널톡(Channel Talk) SDK — 커뮤니티/대시보드/설정/온보딩 섹션에서만 우측 하단에 노출.
// https://developers.channel.io/ko/articles/d27c51d1 의 표준 부트 스니펫을 SPA 방식으로 적용:
// 허용 경로에 진입하면 boot, 벗어나면 shutdown 한다.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// 채널톡을 노출할 경로 접두어 ('/'는 랜딩/온보딩 페이지 — 정확히 루트에서만 매칭)
const ALLOWED_PREFIXES = ['/', '/community', '/dashboard', '/settings', '/onboarding'];

const PLUGIN_KEY = process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY;

declare global {
  interface Window {
    ChannelIO?: ((...args: unknown[]) => void) & { q?: unknown[]; c?: (args: unknown) => void };
    ChannelIOInitialized?: boolean;
  }
}

// 공식 설치 스니펫과 동일 — SDK 로드 전 호출을 큐에 쌓는 프록시를 만들고 스크립트를 붙인다.
function loadScript() {
  if (window.ChannelIOInitialized) return;
  window.ChannelIOInitialized = true;

  const ch = function (...args: unknown[]) {
    ch.c(args);
  } as NonNullable<Window['ChannelIO']> & { q: unknown[]; c: (args: unknown) => void };
  ch.q = [];
  ch.c = function (args: unknown) {
    ch.q.push(args);
  };
  window.ChannelIO = ch;

  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;
  s.src = 'https://cdn.channel.io/plugin/ch-plugin-web.js';
  const x = document.getElementsByTagName('script')[0];
  if (x?.parentNode) x.parentNode.insertBefore(s, x);
  else document.head.appendChild(s);
}

export default function ChannelTalk({ memberId, name }: { memberId?: string; name?: string }) {
  const pathname = usePathname();
  const allowed = ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!PLUGIN_KEY) return; // 플러그인 키 미설정 시 no-op

    if (allowed) {
      loadScript();
      window.ChannelIO?.('boot', {
        pluginKey: PLUGIN_KEY,
        // 로그인 사용자는 멤버로 식별 (미로그인 시 익명)
        ...(memberId ? { memberId, profile: name ? { name } : undefined } : {}),
      });
      // SPA 페이지 전환 추적
      window.ChannelIO?.('setPage', pathname);
      return () => {
        window.ChannelIO?.('shutdown');
      };
    }
    // 허용 경로가 아니면 혹시 떠 있는 위젯을 내린다
    window.ChannelIO?.('shutdown');
  }, [allowed, pathname, memberId, name]);

  return null;
}
