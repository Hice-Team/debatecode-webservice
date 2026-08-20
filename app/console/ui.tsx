// 관리 콘솔 공용 UI 조각 — 서버/클라이언트 페이지에서 함께 쓰는 헤더·빈 행·버튼 클래스.
export const BTN_APPROVE =
  'rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700';
export const BTN_REJECT =
  'rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg hover:border-rose-300 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600';
export const BTN_PRIMARY =
  'rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
export const BTN_NEUTRAL =
  'rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
export const BTN_DANGER =
  'rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600';

export const FIELD =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-fg-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';
export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal';

// 신고 사유·대상 라벨은 app/lib/report-targets.ts가 원본이다.
// 콘솔이 별도 목록을 들고 있으면 새 대상을 추가할 때 한쪽만 고쳐져 "알 수 없는 유형"이 뜬다.
export { reasonLabel, targetLabel } from '@/app/lib/report-targets';

/* ---------- 우선순위 / 상태 ---------- */

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];

export const PRIORITY_META: Record<Priority, { label: string; cls: string; weight: number }> = {
  urgent: { label: '긴급', cls: 'border-rose-300 bg-rose-100 text-rose-800', weight: 3 },
  high: { label: '높음', cls: 'border-amber-300 bg-amber-50 text-amber-800', weight: 2 },
  normal: { label: '보통', cls: 'border-hairline bg-paper text-fg-secondary', weight: 1 },
  low: { label: '낮음', cls: 'border-hairline bg-paper text-fg-quiet', weight: 0 },
};

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = PRIORITY_META[(priority as Priority) in PRIORITY_META ? (priority as Priority) : 'normal'];
  return (
    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

/**
 * 접수 후 경과 시간 배지.
 *
 * "3일 전"보다 "72시간 방치"가 손이 먼저 간다. 24시간을 넘기면 주황, 72시간을 넘기면
 * 빨강으로 올려서 오래된 건이 목록에서 스스로 튀어나오게 한다.
 */
export function SlaBadge({ since, done }: { since: Date | string; done?: boolean }) {
  const ms = new Date().getTime() - new Date(since).getTime();
  const hours = Math.floor(ms / 3600000);
  const text = hours < 1 ? '방금' : hours < 24 ? `${hours}시간` : `${Math.floor(hours / 24)}일`;
  const cls = done
    ? 'text-fg-quiet'
    : hours >= 72
      ? 'text-rose-600 font-semibold'
      : hours >= 24
        ? 'text-amber-700'
        : 'text-fg-muted';
  return (
    <span className={`shrink-0 font-mono text-[10px] ${cls}`} title={new Date(since).toLocaleString('ko-KR')}>
      {text}
    </span>
  );
}

export function StatusBadge({ label, tone }: { label: string; tone: 'open' | 'progress' | 'done' | 'muted' }) {
  const cls = {
    open: 'border-rose-200 bg-rose-50 text-rose-700',
    progress: 'border-sky-200 bg-sky-50 text-sky-700',
    done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    muted: 'border-hairline bg-paper text-fg-muted',
  }[tone];
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${cls}`}>{label}</span>;
}

/* ---------- 헤더 / 빈 상태 ---------- */

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <span className="text-xs font-bold uppercase tracking-wider text-brand-600">{eyebrow}</span>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
          {title}
        </h1>
        {sub && <p className="mt-1 text-sm text-fg-secondary">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-xl font-bold text-ink">{title}</h3>
      {sub && <p className="mt-1 text-sm text-fg-secondary">{sub}</p>}
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return <p className="px-5 py-8 text-center text-sm text-fg-muted">{text}</p>;
}

/** 빈 상태 — 목록이 비었을 때 "왜 비었는지"와 다음 행동을 함께 준다. */
export function EmptyState({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <p className="text-sm font-semibold text-fg-secondary">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-xs text-fg-muted">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * 지표 묶음 — 콘솔 페이지 상단에서 "지금 처리해야 할 것이 몇 건인가"를 먼저 보여 준다.
 * 페이지마다 같은 격자를 복붙하던 것을 한곳으로 모았다.
 */
export function StatGrid({
  stats,
}: {
  stats: Array<{ label: string; value: number | string; warn?: boolean; sub?: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-hairline bg-white px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-quiet">{stat.label}</p>
          <p className={`mt-1 font-display text-2xl font-bold ${stat.warn ? 'text-rose-600' : 'text-ink'}`}>
            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
          </p>
          {stat.sub && <p className="mt-0.5 text-[11px] text-fg-muted">{stat.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/* ---------- 탭 (서버 렌더 · 링크 기반) ---------- */

export interface TabItem {
  href: string;
  label: string;
  count?: number;
  active: boolean;
}

/**
 * 링크 탭 — 상태를 URL에 두어 새로고침·뒤로가기·북마크가 그대로 동작한다.
 * (운영 화면에서는 "아까 보던 그 필터"로 돌아가는 게 자주 필요하다.)
 */
export function LinkTabs({ items }: { items: TabItem[] }) {
  return (
    <div className="dc-scroll-none mb-4 flex gap-1 overflow-x-auto border-b border-hairline">
      {items.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? 'page' : undefined}
          className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            tab.active
              ? 'border-signal text-signal'
              : 'border-transparent text-fg-secondary hover:border-ink/20 hover:text-ink'
          }`}
        >
          {tab.label}
          {tab.count != null && tab.count > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                tab.active ? 'bg-signal text-white' : 'bg-ink/5 text-fg-muted'
              }`}
            >
              {tab.count}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}

/* ---------- 감사 이력 ---------- */

export interface AuditTrailItem {
  id: string;
  actorName: string;
  actorRole: string;
  action: string;
  summary: string;
  createdAt: Date;
}

/** 특정 대상에 무슨 일이 있었는지 — 상세 패널 하단에 붙인다. */
export function AuditTrail({ items, label }: { items: AuditTrailItem[]; label?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-hairline bg-paper/40 p-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">{label ?? '처리 이력'}</p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 text-[11px] leading-relaxed">
            <span className="shrink-0 font-mono text-fg-quiet">
              {item.createdAt.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
            </span>
            <span className="min-w-0 flex-1 text-fg-secondary">{item.summary}</span>
            <span className="shrink-0 font-mono text-fg-quiet">{item.actorName}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- 안내 배너 ---------- */

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  const cls = {
    info: 'border-sky-200 bg-sky-50/60 text-sky-900',
    warn: 'border-amber-200 bg-amber-50/60 text-amber-900',
    danger: 'border-rose-200 bg-rose-50/60 text-rose-900',
    ok: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${cls}`}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      {children}
    </div>
  );
}
