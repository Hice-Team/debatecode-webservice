import Link from 'next/link';
import Nav from '@/app/components/nav';

// 스마트폰에서 에디터 화면을 열었을 때의 안내.
//
// 에디터는 Monaco + 채점 워커 + 디베이트 패널을 동시에 띄우기 때문에
// 좁은 화면에서는 쓰기 불편한 정도가 아니라 조작 자체가 되지 않는다.
// 그래서 막되, 스마트폰에서도 쓸 수 있는 곳으로 바로 이어지는 길을 함께 준다.
const ELSEWHERE = [
  { href: '/dashboard', label: '대시보드', desc: '진도 · 방어 성공률 · 오답노트' },
  { href: '/study', label: 'AI Search', desc: '개발 질문을 바로 물어보기' },
  { href: '/community', label: '커뮤니티', desc: '풀이 공유 · 질문' },
];

export default function EditorUnavailable({
  title = '이 화면은 스마트폰에서 열 수 없습니다',
  detail = '코드 에디터와 채점기, 디베이트 패널을 함께 띄워야 해서 화면이 좁으면 조작이 어렵습니다. 태블릿이나 PC에서 이어서 진행해 주세요.',
  backHref = '/problems',
  backLabel = '문제집으로',
}: {
  title?: string;
  detail?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink-soft">
      <Nav />
      <main className="mx-auto w-full max-w-md flex-grow px-5 py-14">
        <span aria-hidden className="grid h-12 w-12 place-items-center rounded-[var(--radius-panel)] bg-white text-signal shadow-sm">
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.6]">
            <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
            <path d="M10.5 18.5h3" strokeLinecap="round" />
          </svg>
        </span>

        <h1 className="mt-4 font-display text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-secondary">{detail}</p>

        <p className="mt-7 font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
          스마트폰에서 이용할 수 있는 곳
        </p>
        <ul className="mt-2 space-y-2">
          {ELSEWHERE.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-hairline bg-white px-4 py-3 transition hover:border-brand-300"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{item.label}</span>
                  <span className="block truncate text-[11px] text-fg-muted">{item.desc}</span>
                </span>
                <span aria-hidden className="text-fg-quiet">›</span>
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href={backHref}
          className="mt-6 inline-flex items-center gap-1.5 text-xs text-fg-muted transition-colors hover:text-signal"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current stroke-2" aria-hidden>
            <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel}
        </Link>
      </main>
    </div>
  );
}
