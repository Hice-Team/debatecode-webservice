import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import AnnouncementGate from "./components/announcement-gate";
import MaintenanceGate from "./components/maintenance-gate";
import GlobalBanner from "./components/global-banner";
import BannerSlot from '@/app/components/banner-slot';
import AutoTranslate from "./components/auto-translate";
import ChannelTalk from "./components/channel-talk";

// Fonts are loaded via Google Fonts stylesheet to avoid Turbopack internal imports

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debatecode.org';
const SITE_NAME = 'Debate Code';
const SITE_DESC =
  '디베이트코드는 새로운 온라인 저지 서비스입니다. 일반적인 온라인 저지와 마찬가지로, 알고리즘 풀이 기능을 제공하지만 대화형 모드 제공을 통해 기술 면접까지 준비할 수 있습니다.';

// 루트 메타데이터 — 하위 페이지는 title만 지정하면 template로 " · Debate Code"가 붙고,
// favicon·openGraph·twitter·robots 등은 자동 상속된다.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Debate Code · 대화형 온라인 저지',
    template: '%s · Debate Code',
  },
  description: SITE_DESC,
  applicationName: SITE_NAME,
  keywords: ['온라인 저지', '코딩테스트', '기술면접', 'AI 면접', '알고리즘', 'DebateAI', 'Debate Code', '코딩 문제'],
  authors: [{ name: 'Debate Code' }],
  creator: 'Debate Code',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'ko_KR',
    url: SITE_URL,
    title: 'Debate Code · 대화형 온라인 저지',
    description: SITE_DESC,
    images: [{ url: '/logo.png', width: 1200, height: 630, alt: 'Debate Code' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Debate Code · 대화형 온라인 저지',
    description: SITE_DESC,
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0d12',
  width: 'device-width',
  initialScale: 1,
};

// 유지보수 게이트와 전역 배너가 런타임 설정을 읽으므로 async 컴포넌트다.
// 두 값 모두 요청당 1회 조회로 끝난다(app/lib/settings.ts의 React cache).
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {/* Monaco 에디터 · Pyodide 런타임 · Pretendard 웹폰트 CDN 선연결 (React 19가 head로 호이스팅) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        {/* Google Fonts (Space Grotesk, IBM Plex) loaded via stylesheet to avoid next/font runtime issues */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* Pretendard — 워드마크와 어울리는 국문 본문 서체 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <Providers>
          {/* 점검 모드가 켜져 있으면 일반 방문자에게는 안내 화면만 보인다 */}
          <MaintenanceGate>
            {/* 콘솔에서 설정한 상시 안내 한 줄 — 비어 있으면 아무것도 렌더하지 않는다.
                문제 풀이 화면에서는 작업 공간을 밀어내지 않도록 BannerSlot이 통째로 뺀다. */}
            <BannerSlot>
              <GlobalBanner />
            </BannerSlot>
            {children}
          </MaintenanceGate>
          {/* EN 모드에서 화면의 한국어 텍스트(DB 콘텐츠 포함)를 자동 번역 */}
          <AutoTranslate />
        </Providers>
        <AnnouncementGate />
        {/* 채널톡 — 커뮤니티/대시보드/설정/온보딩에서만 우측 하단 노출 */}
        <ChannelTalk />
      </body>
    </html>
  );
}
