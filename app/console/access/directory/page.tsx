import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@/app/lib/prisma';
import { getUser } from '@/app/lib/dal';
import { can } from '@/app/lib/permissions-server';
import { maskName, providerLabel } from '@/app/lib/privacy';
import DirectoryTable, { type DirectoryUser } from './directory-table';
import { PageHeader, Callout } from '../../ui';

export const metadata: Metadata = { title: '회원 디렉터리' };

// 회원 디렉터리 — 찾고, 고르고, 조치로 넘어가는 곳.
//
// 개인정보 최소화는 그대로 유지한다: 이름은 마스킹하고, 이메일 대신 로그인 방식만 내려보낸다.
export default async function MemberDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const user = await getUser();
  if (!(await can(user, 'member.read'))) redirect('/console');

  const [canGrantRole, canIssueSanction] = await Promise.all([
    can(user, 'role.grant'),
    can(user, 'sanction.issue'),
  ]);

  const { role } = await searchParams;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { submissions: true, posts: true, permissionGrants: true } },
      sanctions: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, type: true, expiresAt: true, active: true },
      },
    },
  });

  // 로그인 방식(provider) — auth.users의 메타데이터에서 조회.
  // 실패해도 목록은 떠야 하므로 빈 배열로 떨어뜨린다.
  const providerRows = await prisma.$queryRaw<{ id: string; provider: string | null }[]>`
      SELECT id::text AS id,
             COALESCE(raw_user_meta_data->>'provider', raw_app_meta_data->>'provider') AS provider
      FROM auth.users`.catch(() => [] as { id: string; provider: string | null }[]);
  const providerById = new Map(providerRows.map((r) => [r.id, r.provider]));

  const now = new Date().getTime();
  const rows: DirectoryUser[] = users.map((u) => {
    // 활성 = active 플래그가 켜져 있고 아직 만료되지 않은 것.
    // 만료된 행을 정리하는 배치를 두지 않고 읽는 시점에 판정한다(app/lib/moderation.ts와 동일).
    const live = u.sanctions.filter((s) => s.active && (!s.expiresAt || s.expiresAt.getTime() > now));
    return {
      id: u.id,
      name: maskName(u.name),
      provider: providerLabel(providerById.get(u.id)),
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      submissions: u._count.submissions,
      posts: u._count.posts,
      activeSanctions: live.map((s) => ({
        id: s.id,
        type: s.type,
        expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
      })),
      pastSanctionCount: u.sanctions.length - live.length,
      overrides: u._count.permissionGrants,
    };
  });

  return (
    <div>
      <PageHeader
        eyebrow="MEMBER DIRECTORY"
        title="회원 디렉터리"
        sub="검색해서 고르고, 역할 변경이나 제재로 넘어갑니다. 모든 조치에는 사유와 확인 단계가 있습니다."
      />

      <div className="mb-4">
        <Callout tone="info" title="개인정보 최소화">
          이름은 마스킹되고 이메일은 내려보내지 않습니다. 로그인 방식만 표시해 계정을 식별합니다. 최근 가입 500명까지
          조회합니다.
        </Callout>
      </div>

      <DirectoryTable
        users={rows}
        currentUserId={user.id}
        canGrantRole={canGrantRole}
        canIssueSanction={canIssueSanction}
        initialRole={role ?? 'all'}
      />
    </div>
  );
}
