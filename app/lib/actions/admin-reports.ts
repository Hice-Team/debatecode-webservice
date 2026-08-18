'use server';

// 신고 처리 액션 — 케이스 단위로 움직인다.
//
// 같은 게시글에 신고가 5건 들어오면 그것은 다섯 개의 일이 아니라 하나의 일이다.
// 그래서 처리·기각·담당자 지정은 모두 `dedupeKey`(대상 유형:대상 ID)로 묶인 무리 전체에
// 적용된다. 한 건만 처리하고 나머지 네 건이 큐에 남는 상황을 없애기 위해서다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { requirePermission } from '../permissions-server';
import { audit } from '../audit';

export interface ReportActionState {
  error?: string;
  saved?: string;
}

/** 케이스에 속한 미처리 신고 ID 전부. */
async function caseReportIds(dedupeKey: string): Promise<string[]> {
  const rows = await prisma.report.findMany({
    where: { dedupeKey, status: 'pending' },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function caseLabel(dedupeKey: string): string {
  const [type, id] = dedupeKey.split(':');
  const label = { post: '게시글', comment: '댓글', user: '사용자' }[type] ?? type;
  return `${label} ${id?.slice(0, 10) ?? ''}`;
}

/* ---------- 처리 / 기각 ---------- */

const resolveSchema = z.object({
  dedupeKey: z.string().min(1),
  action: z.enum(['resolve', 'dismiss']),
  actionTaken: z.string().trim().max(500),
});

/**
 * 케이스 처리 — 묶인 신고를 한 번에 종결한다.
 * `actionTaken`에 "무엇을 했는지"를 남긴다. 상태만 resolved로 바뀌면 나중에
 * "이 신고는 어떻게 처리됐나"에 답할 수 없다.
 */
export async function resolveReportCase(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'report.review');

    const parsed = resolveSchema.safeParse({
      dedupeKey: formData.get('dedupeKey'),
      action: formData.get('action'),
      actionTaken: String(formData.get('actionTaken') ?? ''),
    });
    if (!parsed.success) return { error: '입력값을 확인해 주세요.' };

    const { dedupeKey, action, actionTaken } = parsed.data;
    const ids = await caseReportIds(dedupeKey);
    if (ids.length === 0) return { error: '이미 처리된 케이스입니다.' };

    const resolved = action === 'resolve';
    await prisma.report.updateMany({
      where: { id: { in: ids } },
      data: {
        status: resolved ? 'resolved' : 'dismissed',
        handledById: caller.id,
        resolvedAt: new Date(),
        actionTaken: actionTaken || (resolved ? '처리 완료' : '기각'),
      },
    });

    await audit({
      actor: caller,
      action: resolved ? 'report.resolve' : 'report.dismiss',
      targetType: 'report',
      targetId: dedupeKey,
      summary: `${caseLabel(dedupeKey)} 신고 ${ids.length}건 ${resolved ? '처리완료' : '기각'}${
        actionTaken ? ` — ${actionTaken}` : ''
      }`,
      diff: { after: { status: resolved ? 'resolved' : 'dismissed', reportIds: ids } },
    });

    revalidatePath('/console', 'layout');
    return { saved: `신고 ${ids.length}건을 ${resolved ? '처리' : '기각'}했습니다.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '처리에 실패했습니다.' };
  }
}

/* ---------- 트리아지 ---------- */

/** 담당자 지정 — 빈 값이면 지정 해제. 둘이 같은 건을 동시에 붙잡는 것을 막는다. */
export async function assignReportCase(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'report.review');

  const dedupeKey = String(formData.get('dedupeKey') ?? '');
  const assigneeId = String(formData.get('assigneeId') ?? '') || null;
  const ids = await caseReportIds(dedupeKey);
  if (ids.length === 0) return;

  await prisma.report.updateMany({ where: { id: { in: ids } }, data: { assigneeId } });

  const name = assigneeId
    ? ((await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } }))?.name ?? '알 수 없음')
    : null;
  await audit({
    actor: caller,
    action: 'report.assign',
    targetType: 'report',
    targetId: dedupeKey,
    summary: name ? `${caseLabel(dedupeKey)} 담당자 → ${name}` : `${caseLabel(dedupeKey)} 담당자 지정 해제`,
  });

  revalidatePath('/console/reports');
}

/** 우선순위 변경 — 긴급으로 올린 건이 목록 위로 올라온다. */
export async function setReportPriority(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'report.review');

  const dedupeKey = String(formData.get('dedupeKey') ?? '');
  const priority = String(formData.get('priority') ?? '');
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) return;

  const ids = await caseReportIds(dedupeKey);
  if (ids.length === 0) return;

  await prisma.report.updateMany({ where: { id: { in: ids } }, data: { priority } });
  await audit({
    actor: caller,
    action: 'report.priority',
    targetType: 'report',
    targetId: dedupeKey,
    summary: `${caseLabel(dedupeKey)} 우선순위 → ${priority}`,
  });

  revalidatePath('/console/reports');
}

/** 내부 메모 — 신고자·피신고자에게 보이지 않는다. 인수인계용. */
export async function saveReportNote(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'report.review');

  const dedupeKey = String(formData.get('dedupeKey') ?? '');
  const note = String(formData.get('internalNote') ?? '').trim().slice(0, 2000);
  const ids = await caseReportIds(dedupeKey);
  if (ids.length === 0) return;

  await prisma.report.updateMany({ where: { id: { in: ids } }, data: { internalNote: note || null } });
  await audit({
    actor: caller,
    action: 'report.note',
    targetType: 'report',
    targetId: dedupeKey,
    summary: `${caseLabel(dedupeKey)} 내부 메모 갱신`,
  });

  revalidatePath('/console/reports');
}

/* ---------- 콘텐츠 조치 ---------- */

/**
 * 신고된 콘텐츠 삭제 — 신고 화면을 벗어나지 않고 조치한다.
 *
 * 예전에는 신고를 보고 커뮤니티 관리로 이동해 같은 글을 다시 찾아야 했다.
 * 삭제와 신고 종결을 한 동작으로 묶어, 글은 지웠는데 신고는 큐에 남는 상태를 없앤다.
 */
export async function deleteReportedContent(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'community.moderate');

  const dedupeKey = String(formData.get('dedupeKey') ?? '');
  const [targetType, targetId] = dedupeKey.split(':');
  if (!targetId || (targetType !== 'post' && targetType !== 'comment')) return;

  if (targetType === 'post') {
    await prisma.post.delete({ where: { id: targetId } }).catch(() => {});
  } else {
    await prisma.comment.delete({ where: { id: targetId } }).catch(() => {});
  }

  const ids = await caseReportIds(dedupeKey);
  if (ids.length > 0) {
    await prisma.report.updateMany({
      where: { id: { in: ids } },
      data: {
        status: 'resolved',
        handledById: caller.id,
        resolvedAt: new Date(),
        actionTaken: `${targetType === 'post' ? '게시글' : '댓글'} 삭제`,
      },
    });
  }

  await audit({
    actor: caller,
    action: 'post.delete',
    targetType: targetType === 'post' ? 'post' : 'report',
    targetId,
    summary: `신고 조치로 ${targetType === 'post' ? '게시글' : '댓글'} 삭제 (신고 ${ids.length}건 동시 종결)`,
  });

  revalidatePath('/console', 'layout');
  revalidatePath('/community');
  revalidatePath('/dashboard/community');
}
