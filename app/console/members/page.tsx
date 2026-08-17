import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { canGrantRoles, ROLES, ROLE_LABELS, ROLE_BADGE, type Role } from '@/app/lib/roles';
import { maskName, providerLabel } from '@/app/lib/privacy';
import UserManagement, { type ConsoleUser } from '../user-management';
import { PageHeader } from '../ui';

export const metadata: Metadata = { title: '회원·권한 관리' };

// 회원 및 권한 관리 — 역할 부여/회수(user로 되돌리기), 제재 부여·해제, debateQ 사전허용.
// 개인정보 최소화: 이름 마스킹 + 이메일 대신 로그인 방식만 전달한다.
export default async function MemberManagementPage() {
  const user = await getUser();
  const isAdmin = user.role === 'admin';
  if (!isAdmin && user.role !== 'reviewer') redirect('/console');

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 300,
    select: {
      id: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { submissions: true } },
      sanctions: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, reason: true, expiresAt: true, active: true, createdAt: true },
      },
    },
  });

  // 로그인 방식(provider) — auth.users의 메타데이터에서 조회
  const providerRows = await prisma.$queryRaw<{ id: string; provider: string | null }[]>`
      SELECT id::text AS id,
             COALESCE(raw_user_meta_data->>'provider', raw_app_meta_data->>'provider') AS provider
      FROM auth.users`.catch(() => [] as { id: string; provider: string | null }[]);
  const providerById = new Map(providerRows.map((r) => [r.id, r.provider]));

  const consoleUsers: ConsoleUser[] = users.map((u) => ({
    id: u.id,
    name: maskName(u.name),
    provider: providerLabel(providerById.get(u.id)),
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    submissions: u._count.submissions,
    sanctions: u.sanctions.map((s) => ({
      id: s.id,
      type: s.type,
      reason: s.reason,
      expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
      active: s.active,
      createdAt: s.createdAt.toISOString(),
    })),
  }));

  // 역할별 인원 요약
  const roleCounts = ROLES.map((r) => ({ role: r, count: users.filter((u) => u.role === r).length }));

  return (
    <div>
      <PageHeader
        eyebrow="MEMBER / ROLE MANAGEMENT"
        title="회원·권한 관리"
        sub="역할 부여와 회수(일반 사용자로 되돌리기), 제재, debateQ 사전허용을 관리합니다. 마지막 최고관리자는 강등할 수 없습니다."
      />

      {/* 역할별 분포 요약 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {roleCounts.map(({ role, count }) => (
          <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] ${ROLE_BADGE[role as Role]}`}>
            {ROLE_LABELS[role as Role]}
            <strong>{count}</strong>
          </span>
        ))}
      </div>

      <UserManagement users={consoleUsers} currentUserId={user.id} canGrant={canGrantRoles(user.role)} />
    </div>
  );
}
