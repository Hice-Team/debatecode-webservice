'use server';

// 운영 콘솔 액션 — 역할 가드로 접근을 제어한다.
import { revalidatePath } from 'next/cache';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { canReview, hasConsoleAccess } from '../roles';
import { POINT_AMOUNTS, POINT_KINDS, grantPoints } from '../points';
import { audit } from '../audit';
import { requirePermission } from '../permissions-server';
import type { Permission } from '../permissions';

// 콘솔 접근 가능 역할 전용 (제재/신고/공지 등 일반 운영)
//
// 역할 검사만으로는 부족하다. PermissionGrant의 **개별 차단(deny)** 이 통하지 않기 때문이다.
// 문제가 된 담당자의 권한 하나만 잠그려 해도, 역할만 보는 자리는 그대로 열려 있다.
// requirePermission이 역할 기본값과 오버라이드를 함께 판정한다(app/lib/permissions-server.ts).
async function requireConsole() {
  const caller = await getUser();
  if (!hasConsoleAccess(caller.role)) {
    throw new Error('운영 권한이 없습니다.');
  }
  await requirePermission(caller, 'console.access');
  return caller;
}

/**
 * 검토 권한 전용.
 *
 * 무엇을 검토하는지에 따라 필요한 권한이 다르다 — 신고와 문제 초안과 메이트 신청은
 * 각각 다른 사람에게 맡길 수 있어야 한다. 그래서 호출부가 어느 권한인지 밝힌다.
 */
async function requireReviewer(permission: Permission) {
  const caller = await getUser();
  if (!canReview(caller.role)) {
    throw new Error('검토 권한이 없습니다.');
  }
  await requirePermission(caller, permission);
  return caller;
}


/* ---------- 레거시: 대시보드 커뮤니티 화면 ---------- */

// 커뮤니티 제재 — days > 0이면 지금부터 N일 제한, days = 0이면 해제 (레거시 suspendedUntil).
// 새 제재는 콘솔 › 접근 제어 › 제재 센터를 쓴다(근거·이의제기·감사 로그가 붙는다).
// 이 함수는 /dashboard/community의 빠른 조치 버튼만 남아 있어 유지한다.
export async function suspendUser(targetUserId: string, days: number) {
  const caller = await requireConsole();
  if (caller.id === targetUserId) {
    throw new Error('본인은 제재할 수 없습니다.');
  }

  const suspendedUntil = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
  await prisma.user.update({ where: { id: targetUserId }, data: { suspendedUntil } });
  await audit({
    actor: caller,
    action: days > 0 ? 'sanction.issue' : 'sanction.lift',
    targetType: 'user',
    targetId: targetUserId,
    summary: days > 0 ? `커뮤니티 이용 ${days}일 제한 (대시보드 빠른 조치)` : '커뮤니티 이용 제한 해제 (대시보드 빠른 조치)',
  });

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/dashboard/community');
}

/* ---------- 커뮤니티 관리 ---------- */

// 관리자 글 삭제 — deletePost(작성자용)와 달리 관리 페이지에 머무른다
export async function adminDeletePost(formData: FormData) {
  await requireConsole();
  const postId = String(formData.get('postId') ?? '');
  if (!postId) return;

  await prisma.post.delete({ where: { id: postId } }).catch(() => {});
  revalidatePath('/dashboard/community');
  revalidatePath('/community');
}

/* ---------- 디베이트메이트 문제 검토큐 ---------- */

interface DraftPayload {
  tags?: string[];
  timeLimitMs?: number;
  starterCodes?: Record<string, string>;
  keywords?: string[];
  testCases?: { input: unknown; expected: unknown; isHidden?: boolean; order?: number }[];
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'problem'}-${Date.now().toString(36)}`;
}

// 문제 초안 검토 — approve=true면 Problem/TestCase 생성, false면 반려
export async function reviewProblemDraft(formData: FormData) {
  const caller = await requireReviewer('problem.review');
  const id = String(formData.get('id') ?? '');
  const approve = String(formData.get('action') ?? '') === 'approve';
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!id) return;

  const draft = await prisma.problemDraft.findUnique({ where: { id } });
  if (!draft || draft.status !== 'pending') return;

  if (approve) {
    const payload = (draft.payload ?? {}) as DraftPayload;
    const created = await prisma.problem.create({
      data: {
        slug: slugify(draft.title),
        title: draft.title,
        difficulty: draft.difficulty,
        category: draft.category,
        tags: payload.tags ?? [],
        description: draft.description,
        timeLimitMs: payload.timeLimitMs ?? 3000,
        starterCodes: payload.starterCodes ?? {},
        keywords: payload.keywords ?? [],
      },
    });
    const cases = payload.testCases ?? [];
    if (cases.length) {
      await prisma.testCase.createMany({
        data: cases.map((tc, i) => ({
          problemId: created.id,
          input: tc.input as never,
          expected: tc.expected as never,
          isHidden: tc.isHidden ?? false,
          order: tc.order ?? i,
        })),
      });
    }
  }

  const reviewed = await prisma.problemDraft.update({
    where: { id },
    data: {
      status: approve ? 'approved' : 'rejected',
      reviewNote: note,
      reviewedById: caller.id,
      reviewedAt: new Date(),
    },
    select: { authorId: true },
  });

  await audit({
    actor: caller,
    action: approve ? 'problem.draft.approve' : 'problem.draft.reject',
    targetType: 'problemDraft',
    targetId: id,
    summary: `${draft.title} — ${approve ? '승인·게시' : '반려'}${note ? ` (${note})` : ''}`,
  });

  // 문제 출제 승인 보상 — 승인된 초안에만, 초안 1건당 1회 지급
  if (approve) {
    await grantPoints({
      userId: reviewed.authorId,
      amount: POINT_AMOUNTS[POINT_KINDS.problemApproved],
      kind: POINT_KINDS.problemApproved,
      refType: 'problemDraft',
      refId: id,
    });
  }

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/problems');
}

/* ---------- 디베이트메이트 신청 검토 ---------- */

// 신청 검토 — approve=true면 신청자 role=debate_mate. note(반려서/승인 메모)는 신청자에게 표시된다.
// 단, 이미 상위/특수 역할(admin·reviewer·problem_setter·partner)인 계정은 강등하지 않는다.
// (일반 user만 debate_mate로 승격 — admin이 메이트 승인으로 강등되는 사고 방지)
export async function reviewMateApplication(formData: FormData) {
  const caller = await requireReviewer('mate.review');
  const id = String(formData.get('id') ?? '');
  const approve = String(formData.get('action') ?? '') === 'approve';
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000) || null;
  if (!id) return;

  const app = await prisma.debateMateApplication.findUnique({ where: { id } });
  if (!app || app.status !== 'pending') return;

  const target = await prisma.user.findUnique({ where: { id: app.userId }, select: { role: true } });
  const shouldPromote = approve && target?.role === 'user';

  await prisma.$transaction([
    prisma.debateMateApplication.update({
      where: { id },
      data: { status: approve ? 'approved' : 'rejected', reviewNote: note, reviewedById: caller.id, reviewedAt: new Date() },
    }),
    ...(shouldPromote
      ? [prisma.user.update({ where: { id: app.userId }, data: { role: 'debate_mate' } })]
      : []),
  ]);

  await audit({
    actor: caller,
    action: approve ? 'mate.approve' : 'mate.reject',
    targetType: 'mate',
    targetId: app.userId,
    summary: `디베이트메이트 신청 ${approve ? '승인' : '반려'}${shouldPromote ? ' (역할 승격)' : ''}${note ? ` — ${note}` : ''}`,
  });

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// 디베이트메이트 권한 회수 — 본인 요청 또는 활동 위반 시. role을 user로 되돌리고
// 신청서를 revoked로 남겨 사유가 이력에 남는다. 재신청은 가능하다.
export async function revokeDebateMate(formData: FormData) {
  const caller = await requireReviewer('mate.review');
  const userId = String(formData.get('userId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 2000) || '운영 정책에 따른 권한 회수';
  if (!userId) return;
  if (caller.id === userId) throw new Error('본인의 권한은 회수할 수 없습니다.');

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!target || target.role !== 'debate_mate') throw new Error('디베이트메이트 역할이 아닌 사용자입니다.');

  const app = await prisma.debateMateApplication.findUnique({ where: { userId }, select: { id: true } });
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role: 'user' } }),
    ...(app
      ? [
          prisma.debateMateApplication.update({
            where: { id: app.id },
            data: { status: 'revoked', reviewNote: reason, reviewedById: caller.id, reviewedAt: new Date() },
          }),
        ]
      : []),
  ]);

  await audit({
    actor: caller,
    action: 'mate.revoke',
    targetType: 'mate',
    targetId: userId,
    summary: `디베이트메이트 권한 회수 — ${reason}`,
  });

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

/**
 * 메이트 경고 — 회수까지 가기 전 단계.
 *
 * 별도 표를 만들지 않고 감사 로그(action='mate.warn')로 남긴다. 경고는 상태가 아니라
 * 사건이고, 필요한 것은 "몇 번 경고했나"와 "무엇 때문이었나" 둘뿐이라 이력만으로 충분하다.
 */
export async function warnDebateMate(formData: FormData) {
  const caller = await requireReviewer('mate.review');
  const userId = String(formData.get('userId') ?? '');
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 1000);
  if (!userId || !reason) return;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!target) return;

  await audit({
    actor: caller,
    action: 'mate.warn',
    targetType: 'mate',
    targetId: userId,
    summary: `메이트 경고 — ${reason}`,
  });

  revalidatePath('/console/mates');
}

/* ---------- 전체 공지 팝업 ---------- */

// 공개 팝업은 app/lib/actions/admin-popups.ts 로 옮겼다.
// 활성 1건 강제를 풀고(여러 개 동시 노출), 포스터 이미지와 이동 버튼이 붙으면서
// 폼과 검증이 함께 커졌다.
