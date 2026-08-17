// 관리 콘솔 공용 UI 조각 — 서버/클라이언트 페이지에서 함께 쓰는 헤더·빈 행·버튼 클래스.
export const BTN_APPROVE =
  'rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';
export const BTN_REJECT =
  'rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink-soft/80 hover:border-rose-300 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600';
export const BTN_PRIMARY =
  'rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
export const BTN_NEUTRAL =
  'rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-ink-soft/80 hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

export const REPORT_REASON: Record<string, string> = {
  spam: '스팸/광고',
  abuse: '욕설/비방',
  illegal: '불법정보',
  etc: '기타',
};
export const TARGET_LABEL: Record<string, string> = { post: '게시글', comment: '댓글', user: '사용자' };

export function PageHeader({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <span className="text-xs font-bold uppercase tracking-wider text-brand-600">{eyebrow}</span>
      <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
        {title}
      </h1>
      {sub && <p className="mt-1 text-sm text-ink-soft/60">{sub}</p>}
    </div>
  );
}

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-xl font-bold text-ink">{title}</h3>
      {sub && <p className="mt-1 text-sm text-ink-soft/60">{sub}</p>}
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-ink-soft/55">{text}</p>;
}

/**
 * 지표 묶음 — 콘솔 페이지 상단에서 "지금 처리해야 할 것이 몇 건인가"를 먼저 보여 준다.
 * 페이지마다 같은 격자를 복붙하던 것을 한곳으로 모았다.
 */
export function StatGrid({
  stats,
}: {
  stats: Array<{ label: string; value: number | string; warn?: boolean }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-ink/10 bg-white px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-ink-soft/40">{stat.label}</p>
          <p className={`mt-1 font-display text-2xl font-bold ${stat.warn ? 'text-rose-600' : 'text-ink'}`}>
            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
          </p>
        </div>
      ))}
    </div>
  );
}
