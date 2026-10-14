// 콘텐츠 페이지 공용 셸 — "다크 크롬(Nav/Footer) + 페이퍼 본문" 레이아웃.
// 페이지마다 복붙되던 wrapper/main 구조와 `// slug` 헤더 패턴을 한 곳으로 모은다.
// 헤더 제목/설명은 I18nSlot을 거쳐 KO/EN 전환에 반응한다 (사전 키: page-{slug}-title/-desc).
import Nav from './nav';
import Footer from './footer';
import I18nSlot from './i18n-slot';

const WIDTHS = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
} as const;

export function PageShell({
  width = '5xl',
  children,
}: {
  width?: keyof typeof WIDTHS;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-paper text-fg">
      <Nav />
      <main className={`flex-grow ${WIDTHS[width]} w-full mx-auto px-6 sm:px-8 py-12`}>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function PageHeader({
  slug,
  title,
  desc,
  actions,
  className = 'mb-8',
}: {
  slug: string;
  title: React.ReactNode;
  desc?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div>
        {/* 아이브로우는 "여기가 어디인지"만 조용히 알린다. 예전에는 굵기·크기가 제목과
            비슷해 둘이 서로 경쟁했다 — 위계는 색이 아니라 명도와 무게로 만든다. */}
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-fg-muted">
          {slug.replace(/-/g, ' ')}
        </span>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          <I18nSlot k={`page-${slug}-title`} fallback={title} />
        </h1>
        {desc && (
          <p className="mt-2 text-fg-secondary">
            <I18nSlot k={`page-${slug}-desc`} fallback={desc} />
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}
