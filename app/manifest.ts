import type { MetadataRoute } from 'next';

// 🌟 Next.js 정적 내보내기(output: 'export')를 위한 빌드 에러 방지 옵션
export const dynamic = "force-static";

// /manifest.webmanifest — PWA 기본 매니페스트 (설치 배너·홈 화면 아이콘)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Debate Code · 대화형 온라인 저지',
    short_name: 'Debate Code',
    description:
      '알고리즘 풀이부터 AI와의 대화형 기술 면접까지 — 국내 최초 대화형 온라인 저지.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0d12',
    theme_color: '#0b0d12',
    lang: 'ko',
    icons: [
      { src: '/icon.png', sizes: 'any', type: 'image/png' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}