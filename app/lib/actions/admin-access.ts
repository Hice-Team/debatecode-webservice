'use server';

// 접근 제어 액션 — 역할 변경, 개별 권한 오버라이드, 제재 발급·해제·이의제기.
//
// 이전 구조에서는 드롭다운을 바꾸고 [적용]을 누르면 사유도 기록도 없이 권한이 즉시 바뀌었다.
// 여기서는 세 가지를 강제한다:
//   1) 사유 없이는 바꿀 수 없다 — 나중에 "왜 이렇게 됐지"에 답할 수 있어야 한다
//   2) 모든 변경은 감사 로그에 전/후와 함께 남는다
//   3) 제재는 근거(어느 신고·어느 글)를 함께 저장한다 — 이의제기 대응의 재료
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { PERMISSIONS, permissionLabel, ROLES } from '../permissions';
import { requirePermission } from '../permissions-server';
import { roleLabel, type Role } from '../roles';
import { maskName } from '../privacy';
import { audit } from '../audit';
import { SANCTION_TYPES, SANCTION_TYPE_LABEL, sanctionTypeLabel } from '../sanctions';

/* ---------- 공통 ---------- */

async function targetName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u ? maskName(u.name) : '(삭제된 계정)';
}

/** 마지막 최고관리자를 잃지 않도록 — 강등 대상에 admin이 몇 명 포함되는지 검사한다. */
async function assertNotLastAdmin(targetIds: string[], nextRole: Role) {
  if (nextRole === 'admin') return;
  const admins = await prisma.user.count({ where: { role: 'admin' } });
  const demoting = await prisma.user.count({ where: { id: { in: targetIds }, role: 'admin' } });
  if (demoting > 0 && admins - demoting <= 0) {
    throw new Error('마지막 최고관리자는 강등할 수 없습니다. 다른 계정을 먼저 최고관리자로 지정하세요.');
  }
}

/* ---------- 역할 변경 ---------- */

const roleChangeSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, '대상 계정이 없습니다.'),
  role: z.enum(ROLES as [Role, ...Role[]]),
  reason: z.string().trim().min(4, '변경 사유를 4자 이상 적어 주세요.').max(500),
});

export interface AccessFormState {
  error?: string;
  saved?: string;
}

/**
 * 역할 변경 — 한 명 또는 여러 명. 사유가 필수다.
 * 단건과 일괄을 한 액션으로 합쳤다. 갈라 두니 보호 로직(마지막 관리자)이 두 벌이 되고,
 * 실제로 한쪽에만 반영되는 일이 생긴다.
 */
export async function changeUserRole(
  _prev: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'role.grant');

    const parsed = roleChangeSchema.safeParse({
      userIds: String(formData.get('userIds') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      role: formData.get('role'),
      reason: formData.get('reason'),
    });
    if (!parsed.success) {
      return { error: z.flattenError(parsed.error).fieldErrors.reason?.[0] ?? '입력값을 확인해 주세요.' };
    }

    const { role, reason } = parsed.data;
    const ids = parsed.data.userIds.filter((id) => id !== caller.id);
    if (ids.length === 0) return { error: '본인의 권한은 변경할 수 없습니다.' };

    await assertNotLastAdmin(ids, role);

    const targets = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, role: true },
    });
    if (targets.length === 0) return { error: '대상 계정을 찾을 수 없습니다.' };

    // 이미 그 역할인 계정은 건너뛴다 — 감사 로그에 의미 없는 행이 쌓이지 않게
    const changing = targets.filter((t) => t.role !== role);
    if (changing.length === 0) return { saved: '변경할 내용이 없습니다.' };

    await prisma.user.updateMany({ where: { id: { in: changing.map((t) => t.id) } }, data: { role } });

    if (changing.length === 1) {
      const t = changing[0];
      await audit({
        actor: caller,
        action: 'role.change',
        targetType: 'user',
        targetId: t.id,
        summary: `${maskName(t.name)} · ${roleLabel(t.role)} → ${roleLabel(role)} (사유: ${reason})`,
        diff: { before: t.role, after: role },
      });
    } else {
      await audit({
        actor: caller,
        action: 'role.change.bulk',
        targetType: 'user',
        summary: `${changing.length}명을 ${roleLabel(role)}(으)로 변경 (사유: ${reason})`,
        diff: { before: changing.map((t) => ({ id: t.id, role: t.role })), after: role },
      });
    }

    revalidatePath('/console', 'layout');
    revalidatePath('/dashboard');
    return { saved: `${changing.length}명의 역할을 ${roleLabel(role)}(으)로 변경했습니다.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '역할 변경에 실패했습니다.' };
  }
}

/* ---------- 개별 권한 오버라이드 ---------- */

const grantSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1, '대상 계정을 한 명 이상 고르세요.').max(100),
  permissions: z.array(z.string().min(1)).min(1, '권한을 한 개 이상 고르세요.').max(40),
  effect: z.enum(['allow', 'deny']),
  reason: z.string().trim().min(4, '사유를 4자 이상 적어 주세요.').max(500),
  days: z.number().int().min(0).max(3650),
});

/**
 * 권한을 열거나(allow) 잠근다(deny) — 대상과 권한 모두 여러 개를 한 번에.
 *
 * 역할을 통째로 올리지 않고 필요한 것만 주기 위한 장치다. 반대로, 문제가 된 계정의
 * 역할은 유지하면서 위험한 권한만 잠글 수도 있다 — 이쪽이 실제로 더 자주 쓰인다.
 *
 * 한 명씩 반복하던 것을 다중 선택으로 바꾼 이유: 운영팀 3명에게 같은 권한 2개를 주려면
 * 예전에는 같은 폼을 여섯 번 채워야 했고, 그 과정에서 사유가 제각각으로 남았다.
 */
export async function setPermissionGrant(
  _prev: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'permission.grant');

    const split = (name: string) =>
      String(formData.get(name) ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

    const parsed = grantSchema.safeParse({
      userIds: split('userIds'),
      permissions: split('permissions'),
      effect: formData.get('effect'),
      reason: formData.get('reason'),
      days: Number(formData.get('days') ?? 0),
    });
    if (!parsed.success) {
      const fields = z.flattenError(parsed.error).fieldErrors;
      return {
        error: fields.reason?.[0] ?? fields.userIds?.[0] ?? fields.permissions?.[0] ?? '입력값을 확인해 주세요.',
      };
    }

    const { effect, reason, days } = parsed.data;
    const permissions = parsed.data.permissions.filter((p) => p in PERMISSIONS);
    if (permissions.length === 0) return { error: '알 수 없는 권한입니다.' };

    // 자기 권한을 스스로 늘리는 경로를 막는다 — 권한 상승의 가장 흔한 구멍
    const userIds = parsed.data.userIds.filter((id) => id !== caller.id);
    if (userIds.length === 0) return { error: '본인의 권한은 직접 변경할 수 없습니다.' };

    const expiresAt = days > 0 ? new Date(Date.now() + days * 86400_000) : null;

    // 조합마다 upsert — 같은 (계정, 권한)이 이미 있으면 방향과 기간만 갱신된다
    await Promise.all(
      userIds.flatMap((userId) =>
        permissions.map((permission) =>
          prisma.permissionGrant.upsert({
            where: { userId_permission: { userId, permission } },
            create: { userId, permission, effect, reason, expiresAt, grantedById: caller.id },
            update: { effect, reason, expiresAt, grantedById: caller.id },
          }),
        ),
      ),
    );

    const names = await Promise.all(userIds.slice(0, 5).map(targetName));
    const who = names.join(', ') + (userIds.length > 5 ? ` 외 ${userIds.length - 5}명` : '');
    const what = permissions.map(permissionLabel).join(', ');

    await audit({
      actor: caller,
      action: 'permission.grant',
      targetType: 'user',
      targetId: userIds.length === 1 ? userIds[0] : undefined,
      summary: `${who} · ${what} ${effect === 'allow' ? '허용' : '차단'}${
        expiresAt ? ` (${days}일)` : ' (무기한)'
      } — ${reason}`,
      diff: { after: { userIds, permissions, effect, expiresAt } },
    });

    revalidatePath('/console', 'layout');
    return {
      saved: `${userIds.length}명에게 권한 ${permissions.length}건을 ${effect === 'allow' ? '허용' : '차단'}했습니다.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '권한 설정에 실패했습니다.' };
  }
}

/** 오버라이드 제거 — 역할 기본값으로 되돌린다. */
export async function removePermissionGrant(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'permission.grant');

  const id = String(formData.get('id') ?? '');
  const grant = await prisma.permissionGrant.findUnique({ where: { id } });
  if (!grant) return;

  await prisma.permissionGrant.delete({ where: { id } }).catch(() => {});
  await audit({
    actor: caller,
    action: 'permission.revoke',
    targetType: 'user',
    targetId: grant.userId,
    summary: `${await targetName(grant.userId)} · ${permissionLabel(grant.permission)} 오버라이드 제거 (역할 기본값으로 복귀)`,
    diff: { before: { permission: grant.permission, effect: grant.effect } },
  });

  revalidatePath('/console', 'layout');
}

/* ---------- 제재 ---------- */

const sanctionSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(SANCTION_TYPES),
  days: z.number().int().min(0).max(3650),
  reason: z.string().trim().min(4, '제재 사유를 4자 이상 적어 주세요.').max(500),
  reportIds: z.array(z.string()).optional(),
  evidenceNote: z.string().trim().max(1000).optional(),
});

/**
 * 제재 발급 — 근거와 함께 저장한다.
 *
 * 근거(evidence)를 필수 구조로 둔 이유: 이의제기가 들어왔을 때 "그때 무엇을 보고 걸었는지"가
 * 없으면 답을 만들 수 없다. 신고에서 넘어온 경우 신고 ID가 자동으로 붙는다.
 */
export async function issueSanctionAction(
  _prev: AccessFormState,
  formData: FormData,
): Promise<AccessFormState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'sanction.issue');

    const parsed = sanctionSchema.safeParse({
      userId: formData.get('userId'),
      type: formData.get('type'),
      days: Number(formData.get('days') ?? 0),
      reason: formData.get('reason'),
      reportIds: String(formData.get('reportIds') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      evidenceNote: String(formData.get('evidenceNote') ?? ''),
    });
    if (!parsed.success) {
      return { error: z.flattenError(parsed.error).fieldErrors.reason?.[0] ?? '입력값을 확인해 주세요.' };
    }

    const { userId, type, days, reason, reportIds, evidenceNote } = parsed.data;
    if (userId === caller.id) return { error: '본인은 제재할 수 없습니다.' };

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true } });
    if (!target) return { error: '대상 계정을 찾을 수 없습니다.' };

    const expiresAt = days > 0 ? new Date(Date.now() + days * 86400_000) : null;

    await prisma.sanction.create({
      data: {
        userId,
        type,
        reason,
        expiresAt,
        issuedById: caller.id,
        evidence: {
          reportIds: reportIds ?? [],
          note: evidenceNote || null,
          issuedByName: caller.name,
        } as never,
      },
    });

    await audit({
      actor: caller,
      action: 'sanction.issue',
      targetType: 'user',
      targetId: userId,
      summary: `${maskName(target.name)} · ${SANCTION_TYPE_LABEL[type]} 제한 ${days > 0 ? `${days}일` : '영구'} — ${reason}`,
      diff: { after: { type, days, reason, reportIds } },
    });

    revalidatePath('/console', 'layout');
    revalidatePath('/dashboard/community');
    return {
      saved: `${maskName(target.name)}에게 ${SANCTION_TYPE_LABEL[type]} 제한(${days > 0 ? `${days}일` : '영구'})을 적용했습니다.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '제재 발급에 실패했습니다.' };
  }
}

/** 제재 해제 — 이력은 남기고 active=false. 해제 사유가 필수다. */
export async function liftSanctionAction(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'sanction.lift');

  const id = String(formData.get('id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || '운영진 판단에 따른 해제';
  const sanction = await prisma.sanction.findUnique({
    where: { id },
    select: { userId: true, type: true, active: true },
  });
  if (!sanction || !sanction.active) return;

  await prisma.sanction.update({
    where: { id },
    data: { active: false, liftedById: caller.id, liftedAt: new Date(), liftReason: reason },
  });

  await audit({
    actor: caller,
    action: 'sanction.lift',
    targetType: 'user',
    targetId: sanction.userId,
    summary: `${await targetName(sanction.userId)} · ${sanctionTypeLabel(sanction.type)} 제한 해제 — ${reason}`,
  });

  revalidatePath('/console', 'layout');
  revalidatePath('/dashboard/community');
}

/** 여러 제재를 한 번에 해제 — 잘못 건 일괄 제재를 되돌릴 때. */
export async function liftSanctionsBulk(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'sanction.lift');

  const ids = String(formData.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const reason = String(formData.get('reason') ?? '').trim() || '일괄 해제';
  if (ids.length === 0) return;

  const { count } = await prisma.sanction.updateMany({
    where: { id: { in: ids }, active: true },
    data: { active: false, liftedById: caller.id, liftedAt: new Date(), liftReason: reason },
  });
  if (count === 0) return;

  await audit({
    actor: caller,
    action: 'sanction.lift',
    targetType: 'sanction',
    summary: `제재 ${count}건 일괄 해제 — ${reason}`,
    diff: { before: ids },
  });

  revalidatePath('/console', 'layout');
}

/**
 * 이의제기 처리 — 인정하면 제재를 함께 푼다.
 *
 * 인정과 해제를 한 동작으로 묶은 이유: 따로 두면 "인정했는데 제재는 그대로"인 상태가
 * 만들어지고, 그게 이용자에게는 무시당한 것으로 보인다.
 */
export async function resolveAppeal(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'sanction.lift');

  const id = String(formData.get('id') ?? '');
  const accept = String(formData.get('action') ?? '') === 'accept';
  const note = String(formData.get('note') ?? '').trim() || (accept ? '이의 인정' : '이의 기각');

  const sanction = await prisma.sanction.findUnique({
    where: { id },
    select: { userId: true, type: true, appealStatus: true },
  });
  if (!sanction || sanction.appealStatus !== 'pending') return;

  await prisma.sanction.update({
    where: { id },
    data: {
      appealStatus: accept ? 'accepted' : 'rejected',
      ...(accept
        ? { active: false, liftedById: caller.id, liftedAt: new Date(), liftReason: note }
        : {}),
    },
  });

  await audit({
    actor: caller,
    action: 'sanction.appeal.resolve',
    targetType: 'user',
    targetId: sanction.userId,
    summary: `${await targetName(sanction.userId)} · 이의제기 ${accept ? '인정 (제재 해제)' : '기각'} — ${note}`,
    diff: { after: { appealStatus: accept ? 'accepted' : 'rejected' } },
  });

  revalidatePath('/console', 'layout');
}
