'use server';

// 운영 콘솔 액션 — 역할 가드로 접근을 제어한다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { ROLES, canGrantRoles, canReview, hasConsoleAccess, type Role } from '../roles';
import { POINT_AMOUNTS, POINT_KINDS, grantPoints } from '../points';

// 콘솔 접근 가능 역할 전용 (제재/신고/공지 등 일반 운영)
async function requireConsole() {
  const caller = await getUser();
  if (!hasConsoleAccess(caller.role)) {
    throw new Error('운영 권한이 없습니다.');
  }
  return caller;
}

// 검토(신고/문제초안/디베이트메이트 신청) 권한 전용
async function requireReviewer() {
  const caller = await getUser();
  if (!canReview(caller.role)) {
    throw new Error('검토 권한이 없습니다.');
  }
  return caller;
}

/* ---------- 회원 및 권한 관리 ---------- */

// 역할 부여 — 최고 관리자만. 6개 역할 중 하나로 지정.
export async function setUserRole(formData: FormData) {
  const caller = await getUser();
  if (!canGrantRoles(caller.role)) throw new Error('권한을 변경할 수 있는 역할이 아닙니다.');

  const targetUserId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as Role;
  if (!ROLES.includes(role)) throw new Error('알 수 없는 역할입니다.');
  if (caller.id === targetUserId) throw new Error('본인의 권한은 변경할 수 없습니다.');

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } });
  if (!target) throw new Error('사용자를 찾을 수 없습니다.');

  // 마지막 남은 최고관리자는 강등할 수 없다 — 관리자 전원 소실(락아웃) 방지
  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) throw new Error('마지막 최고관리자는 강등할 수 없습니다.');
  }

  await prisma.user.update({ where: { id: targetUserId }, data: { role } });
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// 여러 사용자에 대해 역할을 일괄 변경
export async function setMultipleUserRoles(formData: FormData) {
  const caller = await getUser();
  if (!canGrantRoles(caller.role)) throw new Error('권한을 변경할 수 있는 역할이 아닙니다.');

  const idsRaw = String(formData.get('userIds') ?? '');
  const role = String(formData.get('role') ?? '') as Role;
  if (!idsRaw) return;
  const ids = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!ROLES.includes(role)) throw new Error('알 수 없는 역할입니다.');

  // 보호: 본인이나 마지막 admin 강등 방지
  const filtered = ids.filter((id) => id !== caller.id);
  if (filtered.length === 0) throw new Error('대상 사용자가 없습니다.');

  // 마지막 admin 보호: 만약 변경 대상에 admin이 포함되어 있고 강등이면 카운트 검사
  const targets = await prisma.user.findMany({ where: { id: { in: filtered } }, select: { id: true, role: true } });
  const adminsToDemote = targets.filter((t) => t.role === 'admin' && role !== 'admin').length;
  if (adminsToDemote > 0) {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount - adminsToDemote <= 0) throw new Error('마지막 최고관리자는 강등할 수 없습니다.');
  }

  await prisma.user.updateMany({ where: { id: { in: filtered } }, data: { role } });
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// 여러 사용자에 대해 동일한 제재를 부여
export async function issueSanctionBatch(formData: FormData) {
  const caller = await requireConsole();
  const idsRaw = String(formData.get('userIds') ?? '');
  const type = String(formData.get('type') ?? '');
  const reason = String(formData.get('reason') ?? '운영 정책 위반');
  const daysRaw = Number(formData.get('days') ?? 0);
  if (!idsRaw) return;
  const ids = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;
  if (!(SANCTION_TYPES as readonly string[]).includes(type)) throw new Error('알 수 없는 제재 유형입니다.');

  const expiresAt = Number.isFinite(daysRaw) && daysRaw > 0 ? new Date(Date.now() + daysRaw * 24 * 3600 * 1000) : null;

  await prisma.sanction.createMany({ data: ids.map((userId) => ({ userId, type, reason, expiresAt, issuedById: caller.id })) });
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// debateQ 사전사용 허용 토글 — 리팩토링모드가 전 회원에게 공개되면서 사용하지 않는다.
// 과거 데이터 호환을 위해 액션과 컬럼은 남겨 두되 콘솔 UI에서는 노출하지 않는다.
// @deprecated
export async function toggleDebateQAccess(formData: FormData) {
  const caller = await getUser();
  if (!canGrantRoles(caller.role)) throw new Error('debateQ 사전사용은 관리자만 허용할 수 있습니다.');

  const targetUserId = String(formData.get('userId') ?? '');
  if (!targetUserId) return;
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { debateQAccess: true } });
  if (!target) return;

  await prisma.user.update({ where: { id: targetUserId }, data: { debateQAccess: !target.debateQAccess } });
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// 커뮤니티 제재 — days > 0이면 지금부터 N일 제한, days = 0이면 해제 (레거시 suspendedUntil)
export async function suspendUser(targetUserId: string, days: number) {
  const caller = await requireConsole();
  if (caller.id === targetUserId) {
    throw new Error('본인은 제재할 수 없습니다.');
  }

  const suspendedUntil = days > 0 ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
  await prisma.user.update({ where: { id: targetUserId }, data: { suspendedUntil } });

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/dashboard/community');
}

/* ---------- 제재(밴) 이력 ---------- */

const SANCTION_TYPES = ['read', 'post', 'comment'] as const;

// 제재 부여 — 유형(열람/글/답글) + 기간(일). days 비우거나 0이면 영구.
export async function issueSanction(formData: FormData) {
  const caller = await requireConsole();
  const userId = String(formData.get('userId') ?? '');
  const type = String(formData.get('type') ?? '');
  const reason = String(formData.get('reason') ?? '').trim() || '운영 정책 위반';
  const daysRaw = Number(formData.get('days') ?? 0);

  if (!userId) throw new Error('대상 사용자가 없습니다.');
  if (!(SANCTION_TYPES as readonly string[]).includes(type)) throw new Error('알 수 없는 제재 유형입니다.');
  if (caller.id === userId) throw new Error('본인은 제재할 수 없습니다.');

  const expiresAt = Number.isFinite(daysRaw) && daysRaw > 0 ? new Date(Date.now() + daysRaw * 24 * 3600 * 1000) : null;

  await prisma.sanction.create({
    data: { userId, type, reason, expiresAt, issuedById: caller.id },
  });
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// 제재 해제 — 이력은 남기고 active=false
export async function liftSanction(formData: FormData) {
  await requireConsole();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await prisma.sanction.update({ where: { id }, data: { active: false } }).catch(() => {});
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
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

/* ---------- 신고 처리 큐 ---------- */

// 신고 처리 — action=resolve|dismiss
export async function resolveReport(formData: FormData) {
  const caller = await requireConsole();
  const id = String(formData.get('id') ?? '');
  const action = String(formData.get('action') ?? '');
  if (!id || !['resolve', 'dismiss'].includes(action)) return;

  await prisma.report
    .update({
      where: { id },
      data: {
        status: action === 'resolve' ? 'resolved' : 'dismissed',
        handledById: caller.id,
        resolvedAt: new Date(),
      },
    })
    .catch(() => {});
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

/* ---------- 문의 처리 큐 ---------- */

export interface InquiryReplyState {
  errors?: { answer?: string[]; form?: string[] };
  saved?: boolean;
}

const inquiryReplySchema = z.object({
  id: z.string().min(1),
  answer: z.string().trim().min(2, '답변은 2자 이상이어야 합니다.').max(4000),
});

export async function answerInquiry(_prev: InquiryReplyState, formData: FormData): Promise<InquiryReplyState> {
  const caller = await requireConsole();
  const parsed = inquiryReplySchema.safeParse({ id: formData.get('id'), answer: formData.get('answer') });
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  await prisma.inquiry
    .update({
      where: { id: parsed.data.id },
      data: { answer: parsed.data.answer, status: 'answered', answeredById: caller.id, answeredAt: new Date() },
    })
    .catch(() => {});
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  return { saved: true };
}

export async function closeInquiry(formData: FormData) {
  await requireConsole();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await prisma.inquiry.update({ where: { id }, data: { status: 'closed' } }).catch(() => {});
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
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
  const caller = await requireReviewer();
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
  const caller = await requireReviewer();
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
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

// 디베이트메이트 권한 회수 — 본인 요청 또는 활동 위반 시. role을 user로 되돌리고
// 신청서를 revoked로 남겨 사유가 이력에 남는다. 재신청은 가능하다.
export async function revokeDebateMate(formData: FormData) {
  const caller = await requireReviewer();
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
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
}

/* ---------- 전체 공지 팝업 ---------- */

export interface AnnouncementFormState {
  errors?: { title?: string[]; content?: string[]; form?: string[] };
  saved?: boolean;
}

const announcementSchema = z.object({
  title: z.string().trim().min(2, '제목은 2자 이상이어야 합니다.').max(80),
  content: z.string().trim().min(5, '내용은 5자 이상이어야 합니다.').max(2000),
});

export async function saveAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  await requireConsole();

  const parsed = announcementSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  // 새 공지를 등록하면 기존 활성 공지는 비활성화 — 팝업은 항상 1건만
  await prisma.$transaction([
    prisma.announcement.updateMany({ where: { active: true }, data: { active: false } }),
    prisma.announcement.create({ data: parsed.data }),
  ]);

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/', 'layout');
  return { saved: true };
}

// 기존 공지 수정 — 제목/내용 변경 (활성 상태는 건드리지 않음)
export async function updateAnnouncement(
  _prev: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  await requireConsole();
  const id = String(formData.get('id') ?? '');
  const parsed = announcementSchema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  if (!id) return { errors: { form: ['공지를 찾을 수 없습니다.'] } };

  await prisma.announcement
    .update({ where: { id }, data: { ...parsed.data, updatedAt: new Date() } })
    .catch(() => {});

  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/', 'layout');
  return { saved: true };
}

export async function toggleAnnouncement(formData: FormData) {
  await requireConsole();
  const id = String(formData.get('id') ?? '');
  const target = await prisma.announcement.findUnique({ where: { id }, select: { active: true } });
  if (!target) return;

  if (target.active) {
    await prisma.announcement.update({ where: { id }, data: { active: false } });
  } else {
    // 활성화 시 다른 공지는 내린다
    await prisma.$transaction([
      prisma.announcement.updateMany({ where: { active: true }, data: { active: false } }),
      prisma.announcement.update({ where: { id }, data: { active: true } }),
    ]);
  }
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/', 'layout');
}

export async function deleteAnnouncement(formData: FormData) {
  await requireConsole();
  const id = String(formData.get('id') ?? '');
  await prisma.announcement.delete({ where: { id } }).catch(() => {});
  revalidatePath('/dashboard');
  revalidatePath('/console', 'layout');
  revalidatePath('/', 'layout');
}
