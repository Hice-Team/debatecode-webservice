// 설정 화면 공용 조각 — 왼쪽에 이름, 오른쪽에 조작부. 사이는 얇은 실선으로만 나눈다.
//
// 카드를 겹겹이 쌓는 대신 행으로 늘어놓는다. 설정은 "무엇을 바꿀 수 있는가"의 목록이고,
// 목록은 줄로 읽을 때 가장 빨리 훑힌다.
import type { ReactNode } from 'react';

/** 한 줄짜리 설정 — 이름(+설명)과 조작부 */
export function SettingRow({
  label,
  desc,
  control,
  /** 조작부가 넓어야 하는 경우(폼 전체 등) 아래로 떨어뜨린다 */
  stacked = false,
}: {
  label: ReactNode;
  desc?: ReactNode;
  control?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={`border-b border-ink/[0.07] py-4 last:border-b-0 ${
        stacked ? '' : 'flex flex-wrap items-center gap-x-6 gap-y-2'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        {desc && <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-ink-soft/55">{desc}</p>}
      </div>
      {control && <div className={stacked ? 'mt-3' : 'shrink-0'}>{control}</div>}
    </div>
  );
}

/** 카테고리 안의 소제목 — 행이 많아질 때만 쓴다 */
export function SettingGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-6 first:mt-0">
      {title && (
        <p className="mb-1 mt-2 font-mono text-[11px] uppercase tracking-wider text-ink-soft/40">{title}</p>
      )}
      {children}
    </div>
  );
}

/** 값만 보여 주는 오른쪽 칸 (읽기 전용) */
export function SettingValue({ children }: { children: ReactNode }) {
  return <span className="text-sm text-ink-soft/70">{children}</span>;
}
