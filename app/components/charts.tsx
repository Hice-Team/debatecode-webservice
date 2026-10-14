// 의존성 없는 순수 SVG 차트 — 서버 컴포넌트에서 그대로 렌더된다.
// 트래픽(면적 라인), 서버 리소스(반원 게이지), 역량(레이더), 분포(가로 막대).

/* ---------- 면적 라인 차트 (트래픽) ---------- */

export interface Series {
  label: string;
  color: string;
  points: number[];
}

export function AreaChart({
  series,
  labels,
  height = 180,
}: {
  series: Series[];
  labels: string[];
  height?: number;
}) {
  const W = 640;
  const H = height;
  const padX = 8;
  const padY = 14;
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.points));
  const x = (i: number) => padX + (i * (W - padX * 2)) / Math.max(1, n - 1);
  const y = (v: number) => H - padY - (v / max) * (H - padY * 2);

  const linePath = (pts: number[]) => pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = (pts: number[]) =>
    `${linePath(pts)} L ${x(n - 1).toFixed(1)} ${(H - padY).toFixed(1)} L ${x(0).toFixed(1)} ${(H - padY).toFixed(1)} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="트래픽 추이">
        {/* 가로 그리드 */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={padX} x2={W - padX} y1={padY + f * (H - padY * 2)} y2={padY + f * (H - padY * 2)} stroke="currentColor" className="text-fg/5" strokeWidth={1} />
        ))}
        {series.map((s, si) => (
          <g key={si}>
            <path d={areaPath(s.points)} fill={s.color} opacity={0.08} />
            <path d={linePath(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 3 : 0} fill={s.color} />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 px-1">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-[11px] text-fg-secondary">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="font-mono text-fg-muted">{s.points.reduce((a, b) => a + b, 0)}건</span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-fg-muted">
          {labels[0]} — {labels[labels.length - 1]}
        </span>
      </div>
      {/* 스크린리더용 데이터 요약 */}
      <p className="sr-only">
        {series.map((s) => `${s.label} 합계 ${s.points.reduce((a, b) => a + b, 0)}건`).join(', ')} ({labels[0]}부터 {labels[labels.length - 1]}까지)
      </p>
    </div>
  );
}

/* ---------- 반원 게이지 (서버 리소스, 대표값) ---------- */

export function Gauge({ label, value, unit, tone = '#4531d9' }: { label: string; value: number; unit?: string; tone?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const R = 40;
  const C = Math.PI * R; // 반원 둘레
  const dash = (pct / 100) * C;

  return (
    <div className="flex flex-col items-center rounded-[var(--radius-panel)] border border-hairline bg-surface p-4">
      <svg viewBox="0 0 100 56" className="w-full max-w-[130px]" role="img" aria-label={`${label} ${Math.round(pct)}${unit ?? '%'}`}>
        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="currentColor" className="text-fg/8" strokeWidth={9} strokeLinecap="round" />
        <path
          d="M 10 50 A 40 40 0 0 1 90 50"
          fill="none"
          stroke={tone}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${dash.toFixed(1)} ${C.toFixed(1)}`}
        />
        <text x="50" y="46" textAnchor="middle" className="fill-ink" style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-space-grotesk)' }}>
          {Math.round(pct)}
          <tspan style={{ fontSize: 9 }}>{unit ?? '%'}</tspan>
        </text>
      </svg>
      <p className="mt-1 text-xs font-medium text-fg-secondary">{label}</p>
    </div>
  );
}

/* ---------- 레이더 차트 (역량) ---------- */

export function RadarChart({ axes, size = 220 }: { axes: { label: string; value: number }[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 34;
  const n = axes.length || 1;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, r: number) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r] as const;

  const poly = axes
    .map((a, i) => {
      const [px, py] = pt(i, (Math.max(0, Math.min(100, a.value)) / 100) * R);
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[260px]"
      role="img"
      aria-label={`역량 레이더: ${axes.map((a) => `${a.label} ${Math.round(a.value)}%`).join(', ')}`}
    >
      {[0.33, 0.66, 1].map((f) => (
        <polygon
          key={f}
          points={axes.map((_, i) => { const [px, py] = pt(i, R * f); return `${px.toFixed(1)},${py.toFixed(1)}`; }).join(' ')}
          fill="none"
          stroke="currentColor"
          className="text-fg/8"
          strokeWidth={1}
        />
      ))}
      {axes.map((_, i) => { const [px, py] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke="currentColor" className="text-fg/8" strokeWidth={1} />; })}
      <polygon points={poly} fill="#4531d9" fillOpacity={0.15} stroke="#4531d9" strokeWidth={2} strokeLinejoin="round" />
      {axes.map((a, i) => {
        const [px, py] = pt(i, R + 16);
        return (
          <text key={i} x={px} y={py} textAnchor="middle" dominantBaseline="middle" className="fill-ink-soft/80" style={{ fontSize: 10 }}>
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

/* ---------- 가로 막대 분포 ---------- */

export function BarDistribution({ items, tone = '#4531d9' }: { items: { label: string; value: number }[]; tone?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-sm text-fg-muted">데이터가 없습니다.</p>;
  return (
    <div className="space-y-2.5" role="list">
      {items.map((it) => (
        <div key={it.label} role="listitem" className="flex items-center gap-3" aria-label={`${it.label} ${it.value}건`}>
          <span className="w-24 shrink-0 truncate text-xs text-fg-secondary">{it.label}</span>
          <div className="h-2.5 flex-1 rounded-full bg-paper" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: tone }} />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-[11px] text-fg-secondary">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
