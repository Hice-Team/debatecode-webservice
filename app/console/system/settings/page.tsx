import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import {
  getSettingsByCategory,
  SETTING_CATEGORY_LABELS,
  type SettingCategory,
} from '@/app/lib/settings';
import { resetSettingCategory } from '@/app/lib/actions/admin-system';
import SettingRow from '../setting-row';
import { PageHeader, LinkTabs, Callout, BTN_NEUTRAL } from '../../ui';

export const metadata: Metadata = { title: '런타임 설정' };

// 유지보수는 전용 화면(../maintenance)에서 다룬다 — 문구와 스위치를 함께 봐야 해서.
const TABS: SettingCategory[] = ['flag', 'limit', 'integration', 'content'];

const TAB_HINTS: Record<string, string> = {
  flag: '기능별 킬 스위치. 특정 기능에서만 오류가 날 때 그 기능만 끄고 나머지는 살려 둡니다.',
  limit: '요청 한도와 크기 제한. 어뷰징이나 비용 급증에 대응합니다.',
  integration: '외부 연동 전환. 한 공급자가 죽었을 때 다른 곳으로 돌립니다.',
  content: '이용자에게 보이는 문구. 배너는 공지 팝업보다 가벼운 상시 노출용입니다.',
};

// 런타임 설정 — 코드를 고치지 않고 서비스 동작을 바꾼다.
export default async function RuntimeSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getUser();
  if (!(await can(user, 'setting.write'))) redirect('/console/system');

  const { tab } = await searchParams;
  const active: SettingCategory = (TABS as string[]).includes(tab ?? '') ? (tab as SettingCategory) : 'flag';

  // 배지에 "몇 개나 기본값에서 벗어났는지"를 띄우려면 전 탭을 다 읽어야 한다.
  // 설정은 수십 개 수준이고 요청당 1회 조회로 끝나므로 부담이 없다.
  const byCategory = await Promise.all(TABS.map((c) => getSettingsByCategory(c)));
  const rows = byCategory[TABS.indexOf(active)];
  const overriddenHere = rows.filter((r) => r.overridden).length;

  return (
    <div>
      <PageHeader
        eyebrow="RUNTIME SETTINGS"
        title="런타임 설정"
        sub="여기서 바꾼 값은 재배포 없이 즉시 반영됩니다. 모든 변경은 감사 로그에 남습니다."
      />

      <div className="mb-5">
        <Callout tone="info" title="이 화면의 쓸모">
          배포된 코드를 고치지 않고 서비스 동작을 바꿉니다. 값이 비어 있으면 코드 기본값으로 동작하므로, 잘못 만졌을
          때는 언제든 기본값으로 되돌릴 수 있습니다.
        </Callout>
      </div>

      <LinkTabs
        items={TABS.map((c, i) => ({
          href: `/console/system/settings?tab=${c}`,
          label: SETTING_CATEGORY_LABELS[c],
          count: byCategory[i].filter((r) => r.overridden).length,
          active: c === active,
        }))}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-fg-secondary">{TAB_HINTS[active]}</p>
        {overriddenHere > 0 && (
          <form action={resetSettingCategory}>
            <input type="hidden" name="category" value={active} />
            <button className={BTN_NEUTRAL}>이 묶음 {overriddenHere}건 기본값으로</button>
          </form>
        )}
      </div>

      <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
        {rows.map((row) => (
          <SettingRow key={row.def.key} def={row.def} value={row.value} overridden={row.overridden} />
        ))}
      </div>

      <p className="mt-3 font-mono text-[11px] text-fg-muted">
        노란 배경 = 기본값에서 변경된 항목 · 총 {rows.length}개 중 {overriddenHere}개 변경됨
      </p>
    </div>
  );
}
