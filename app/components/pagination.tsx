import Link from 'next/link';

// 공용 번호형 페이지네이션 — 처음/이전/…번호…/다음/끝. 서버 컴포넌트에서 href 빌더를 받는다.
// 모바일에서는 window를 좁혀 번호 개수를 줄이고, 컨테이너는 flex-wrap으로 넘친다.
function pageItems(current: number, total: number, window: number): (number | 'gap')[] {
  const pages = new Set<number>([1, total]);
  for (let i = current - window; i <= current + window; i++) {
    if (i >= 1 && i <= total) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}

export default function Pagination({
  page,
  totalPages,
  totalCount,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const items = pageItems(page, totalPages, 1);

  const base =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm transition select-none';
  const clickable = `${base} border-ink/15 bg-white text-fg-secondary hover:border-brand-400 hover:text-signal`;
  const disabled = `${base} border-ink/8 bg-paper text-fg-quiet cursor-not-allowed`;

  return (
    <nav className="mt-8 flex flex-col items-center gap-3" aria-label="페이지 이동">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(1)} className={clickable} aria-label="첫 페이지">«</Link>
        ) : (
          <span className={disabled} aria-hidden>«</span>
        )}
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={clickable} aria-label="이전 페이지">‹</Link>
        ) : (
          <span className={disabled} aria-hidden>‹</span>
        )}

        {items.map((it, i) =>
          it === 'gap' ? (
            <span key={`gap-${i}`} className="inline-flex h-9 w-6 items-center justify-center text-sm text-fg-quiet">…</span>
          ) : it === page ? (
            <span
              key={it}
              aria-current="page"
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-signal px-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25"
            >
              {it}
            </span>
          ) : (
            <Link key={it} href={hrefFor(it)} className={`${clickable} font-medium`}>{it}</Link>
          ),
        )}

        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} className={clickable} aria-label="다음 페이지">›</Link>
        ) : (
          <span className={disabled} aria-hidden>›</span>
        )}
        {page < totalPages ? (
          <Link href={hrefFor(totalPages)} className={clickable} aria-label="마지막 페이지">»</Link>
        ) : (
          <span className={disabled} aria-hidden>»</span>
        )}
      </div>
      <p className="font-mono text-[11px] text-fg-quiet">
        {page} / {totalPages} 페이지 · 총 {totalCount.toLocaleString('ko-KR')}개
      </p>
    </nav>
  );
}
