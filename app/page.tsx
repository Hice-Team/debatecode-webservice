import Nav from './components/nav';
import Footer from './components/footer';
import InteractiveHero from './components/hero/interactive-hero';
import LandingContent from './components/landing/landing-content';

// 디자인 토큰 (워드마크 인디고 기반) — 랜딩은 브릴리언트식 라이트 베이스
// white  : 기본 밴드 / paper #F5F6FB : 교차 밴드
// ink    : #08091A (네이비-블랙 에디터 목업 · 최종 CTA 밴드)
// brand  : #1800AC~#4531D9 (시그널 액센트 — 링크/포커스/버튼)
// add    : emerald (diff +, 나의 반박)
// del    : rose    (diff -, AI의 지적)

export default async function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-white text-ink-soft">
      <Nav />
      <main className="flex-grow">
        <InteractiveHero />
        <LandingContent />
      </main>
      <Footer />
    </div>
  );
}
