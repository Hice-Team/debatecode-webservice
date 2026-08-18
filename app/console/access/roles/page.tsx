import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUP_LABELS,
  ROLE_PERMISSIONS,
  permissionLabel,
  type PermissionGroup,
} from '@/app/lib/permissions';
import { ROLES, ROLE_LABELS, ROLE_BADGE, ROLE_DESCRIPTIONS, roleLabel, type Role } from '@/app/lib/roles';
import { maskName } from '@/app/lib/privacy';
import { removePermissionGrant } from '@/app/lib/actions/admin-access';
import OverrideForm, { type GrantCandidate } from './override-form';
import { PageHeader, SectionHeader, Callout, EmptyRow, BTN_NEUTRAL } from '../../ui';

export const metadata: Metadata = { title: '역할·권한' };

const GROUP_ORDER: PermissionGroup[] = ['console', 'queue', 'content', 'access', 'growth', 'system'];

// 역할 × 권한 매트릭스 + 계정별 오버라이드.
//
// 이 표가 없으면 "검토자는 뭘 할 수 있나"를 코드를 읽어야만 알 수 있다. 운영자가
// 역할을 올리기 전에 무엇을 넘겨주는 것인지 스스로 확인할 수 있어야 한다.
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ user?: string }> }) {
  const viewer = await getUser();
  const [canGrantRole, canGrantPermission] = await Promise.all([
    can(viewer, 'role.grant'),
    can(viewer, 'permission.grant'),
  ]);
  if (!canGrantRole && !canGrantPermission) redirect('/console');

  const { user: presetUserId } = await searchParams;

  const [grants, consoleUsers] = await Promise.all([
    prisma.permissionGrant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, name: true, role: true } } },
    }),
    // 오버라이드 대상 후보 — 콘솔에 못 들어오는 일반 회원에게 권한만 주는 것은
    // 의미가 없으므로(화면이 없다), user 역할은 목록에서 뺀다.
    prisma.user.findMany({
      where: { role: { not: 'user' } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, name: true, role: true },
    }),
  ]);

  const candidates: GrantCandidate[] = consoleUsers.map((u) => ({
    id: u.id,
    name: maskName(u.name),
    role: roleLabel(u.role),
  }));

  const now = new Date().getTime();

  return (
    <div>
      <PageHeader
        eyebrow="ROLES & PERMISSIONS"
        title="역할·권한"
        sub="역할이 주는 기본 권한과, 계정별로 얹은 예외를 함께 봅니다."
      />

      {/* ---- 역할 × 권한 매트릭스 ---- */}
      <SectionHeader
        title="역할별 기본 권한"
        sub="역할을 바꾸면 이 표대로 권한이 따라갑니다. 개별 예외는 아래에서 얹습니다."
      />

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">역할별 권한 매트릭스</caption>
            <thead>
              <tr className="border-b border-ink/10 bg-paper/50">
                <th scope="col" className="px-5 py-3 text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft/60">
                  권한
                </th>
                {ROLES.map((r) => (
                  <th key={r} scope="col" className="px-2 py-3 text-center">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] ${ROLE_BADGE[r as Role]}`}>
                      {ROLE_LABELS[r as Role]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUP_ORDER.map((group) => {
                const perms = ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].group === group);
                if (perms.length === 0) return null;
                return (
                  <>
                    <tr key={`h-${group}`} className="border-b border-ink/5 bg-paper/30">
                      <th
                        scope="colgroup"
                        colSpan={ROLES.length + 1}
                        className="px-5 py-1.5 text-left font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft/40"
                      >
                        {PERMISSION_GROUP_LABELS[group]}
                      </th>
                    </tr>
                    {perms.map((p) => {
                      const def = PERMISSIONS[p] as { label: string; description: string; sensitive?: boolean };
                      return (
                        <tr key={p} className="border-b border-ink/5 last:border-0 hover:bg-brand-50/20">
                          <th scope="row" className="px-5 py-2.5 text-left align-top font-normal">
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium text-ink">{def.label}</span>
                              {def.sensitive && (
                                <span className="shrink-0 rounded border border-rose-200 bg-rose-50 px-1 py-0.5 font-mono text-[9px] text-rose-700">
                                  민감
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block max-w-md text-[11px] leading-relaxed text-ink-soft/50">
                              {def.description}
                            </span>
                          </th>
                          {ROLES.map((r) => {
                            const has = (ROLE_PERMISSIONS[r as Role] as readonly string[]).includes(p);
                            return (
                              <td key={r} className="px-2 py-2.5 text-center align-top">
                                <span
                                  aria-label={`${ROLE_LABELS[r as Role]}: ${has ? '허용' : '없음'}`}
                                  className={`inline-grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${
                                    has
                                      ? def.sensitive
                                        ? 'bg-rose-100 text-rose-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                      : 'bg-ink/[0.05] text-ink-soft/25'
                                  }`}
                                >
                                  {has ? '✓' : '·'}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-ink/10 bg-white px-3.5 py-2.5">
            <p className="text-xs font-semibold text-ink">{ROLE_LABELS[r as Role]}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft/55">{ROLE_DESCRIPTIONS[r as Role]}</p>
          </div>
        ))}
      </div>

      {/* ---- 개별 오버라이드 ---- */}
      {canGrantPermission && (
        <div className="mt-10">
          <SectionHeader
            title="개별 권한 오버라이드"
            sub="역할은 그대로 두고 권한 하나만 열거나 잠급니다. 차단(deny)이 허용(allow)보다 우선합니다."
          />
          <div className="mb-4">
            <Callout tone="info" title="언제 쓰나">
              신고 처리만 한시적으로 맡기고 싶을 때(허용), 또는 역할은 유지하되 문제가 된 권한만 잠그고 싶을
              때(차단) 씁니다. 역할을 통째로 올렸다 내리는 것보다 되돌리기 쉽습니다.
            </Callout>
          </div>
          <OverrideForm candidates={candidates} presetUserId={presetUserId} />
        </div>
      )}

      {/* ---- 현재 걸려 있는 오버라이드 ---- */}
      <div className="mt-8">
        <SectionHeader title={`적용 중인 오버라이드 (${grants.length})`} />
        <div className="divide-y divide-ink/5 overflow-hidden rounded-2xl border border-ink/10 bg-white">
          {grants.length === 0 && <EmptyRow text="역할 기본값을 벗어난 계정이 없습니다." />}
          {grants.map((g) => {
            const expired = g.expiresAt != null && g.expiresAt.getTime() <= now;
            return (
              <div key={g.id} className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${expired ? 'opacity-50' : ''}`}>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                    g.effect === 'allow'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-rose-200 bg-rose-50 text-rose-700'
                  }`}
                >
                  {g.effect === 'allow' ? '허용' : '차단'}
                </span>
                <span className="font-medium text-ink">{maskName(g.user.name)}</span>
                <span className="font-mono text-[11px] text-ink-soft/50">{roleLabel(g.user.role)}</span>
                <span className="text-sm text-ink-soft/75">{permissionLabel(g.permission)}</span>
                {g.reason && <span className="truncate text-xs text-ink-soft/50">— {g.reason}</span>}
                <span className="ml-auto flex items-center gap-3">
                  <span className="shrink-0 font-mono text-[11px] text-ink-soft/40">
                    {expired
                      ? '만료됨'
                      : g.expiresAt
                        ? `~${g.expiresAt.toLocaleDateString('ko-KR')}`
                        : '무기한'}
                  </span>
                  {canGrantPermission && (
                    <form action={removePermissionGrant}>
                      <input type="hidden" name="id" value={g.id} />
                      <button className={BTN_NEUTRAL}>제거</button>
                    </form>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
