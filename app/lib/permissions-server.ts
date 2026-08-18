// 계정별 실효 권한 판정 — 역할 기본값에 PermissionGrant 오버라이드를 얹는다.
//
// 카탈로그(권한 목록·역할표)는 permissions.ts에 있다. 그쪽은 DB를 건드리지 않아
// 클라이언트에서도 쓸 수 있고, 이 파일은 Prisma를 쓰므로 서버 전용이다.
import { cache } from 'react';
import { prisma } from './prisma';
import { asRole, PERMISSIONS, ROLE_PERMISSIONS, permissionLabel, type Permission, type Role } from './permissions';

/* ---------- 계정별 실효 권한 ---------- */

export interface EffectivePermissions {
  role: Role;
  /** 실제로 통과하는 권한 전체 */
  granted: Set<Permission>;
  /** 역할에는 없는데 개별 부여로 열린 것 */
  extraAllows: Permission[];
  /** 역할에는 있는데 개별 차단으로 막힌 것 */
  denied: Permission[];
}

/**
 * 역할 기본값에 오버라이드를 얹은 실효 권한.
 * 만료된 오버라이드는 무시한다(행은 남겨 둔다 — 이력이기도 하므로).
 */
export const effectivePermissions = cache(
  async (userId: string, role: string): Promise<EffectivePermissions> => {
    const r = asRole(role);
    const base = new Set<Permission>(ROLE_PERMISSIONS[r]);

    const grants = await prisma.permissionGrant
      .findMany({
        where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { permission: true, effect: true },
      })
      .catch(() => []);

    const extraAllows: Permission[] = [];
    const denied: Permission[] = [];

    for (const g of grants) {
      const p = g.permission as Permission;
      if (!(p in PERMISSIONS)) continue; // 코드에서 사라진 권한 키는 무시
      if (g.effect === 'deny') {
        if (base.delete(p)) denied.push(p);
      } else if (!base.has(p)) {
        base.add(p);
        extraAllows.push(p);
      }
    }

    return { role: r, granted: base, extraAllows, denied };
  },
);

/** 이 계정이 해당 권한을 갖는가 (오버라이드 반영). */
export async function can(
  user: { id: string; role: string },
  permission: Permission,
): Promise<boolean> {
  const { granted } = await effectivePermissions(user.id, user.role);
  return granted.has(permission);
}

/** 권한이 없으면 던진다 — 서버 액션 앞단용. */
export async function requirePermission(
  user: { id: string; role: string },
  permission: Permission,
): Promise<void> {
  if (!(await can(user, permission))) {
    throw new Error(`권한이 없습니다. (필요 권한: ${permissionLabel(permission)})`);
  }
}
