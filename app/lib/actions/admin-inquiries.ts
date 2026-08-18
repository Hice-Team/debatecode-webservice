'use server';

// 문의 처리 액션.
//
// 이전 구조의 문제 둘을 여기서 고친다:
//   1) 답변을 저장하면 폼이 사라져 **오답변을 고칠 수 없었다.** 답변은 수정 가능해야 한다.
//   2) 답변해도 이용자는 알 수 없었다. 저장과 동시에 회신 메일을 보낸다(키가 없으면 dry-run).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { requirePermission } from '../permissions-server';
import { audit } from '../audit';
import { sendMail } from '../email';
import { getSetting, isEnabled } from '../settings';

export const INQUIRY_CATEGORIES = ['account', 'bug', 'suggestion', 'report', 'payment', 'etc'] as const;

export interface InquiryActionState {
  error?: string;
  saved?: string;
  /** 메일이 실제로 나갔는지 — dry-run이면 화면에 그대로 표시한다 */
  mailed?: 'sent' | 'dry-run' | 'skipped';
}

const answerSchema = z.object({
  id: z.string().min(1),
  answer: z.string().trim().min(2, '답변은 2자 이상이어야 합니다.').max(4000),
  notify: z.boolean(),
});

/**
 * 답변 저장 — 최초 답변과 수정 모두 이 액션을 쓴다.
 *
 * `firstResponseAt`은 처음 한 번만 채운다. 답변을 고쳤다고 첫 응답 시각이 뒤로 밀리면
 * SLA 지표가 실제보다 나쁘게 보인다.
 */
export async function answerInquiry(
  _prev: InquiryActionState,
  formData: FormData,
): Promise<InquiryActionState> {
  const caller = await getUser();
  try {
    await requirePermission(caller, 'inquiry.respond');

    const parsed = answerSchema.safeParse({
      id: formData.get('id'),
      answer: formData.get('answer'),
      notify: formData.get('notify') === 'on' || formData.get('notify') === 'true',
    });
    if (!parsed.success) {
      return { error: z.flattenError(parsed.error).fieldErrors.answer?.[0] ?? '입력값을 확인해 주세요.' };
    }

    const { id, answer, notify } = parsed.data;
    const before = await prisma.inquiry.findUnique({
      where: { id },
      select: { subject: true, answer: true, email: true, firstResponseAt: true },
    });
    if (!before) return { error: '문의를 찾을 수 없습니다.' };

    const isEdit = Boolean(before.answer);

    await prisma.inquiry.update({
      where: { id },
      data: {
        answer,
        status: 'answered',
        answeredById: caller.id,
        answeredAt: new Date(),
        ...(before.firstResponseAt ? {} : { firstResponseAt: new Date() }),
      },
    });

    await audit({
      actor: caller,
      action: isEdit ? 'inquiry.update' : 'inquiry.answer',
      targetType: 'inquiry',
      targetId: id,
      summary: `${isEdit ? '답변 수정' : '답변'} — ${before.subject.slice(0, 60)}`,
      diff: isEdit ? { before: before.answer, after: answer } : { after: answer },
    });

    // 회신 메일 — 주소가 없거나(비회원 미기재) 메일 발송이 꺼져 있으면 건너뛴다
    let mailed: InquiryActionState['mailed'] = 'skipped';
    if (notify && before.email) {
      if (!(await isEnabled('integration.email_enabled'))) {
        mailed = 'skipped';
      } else {
        const supportEmail = await getSetting<string>('content.support_email');
        const result = await sendMail({
          to: before.email,
          subject: `[debateCode] 문의하신 내용에 답변드립니다 — ${before.subject}`,
          html: buildReplyHtml(before.subject, answer, supportEmail),
        }).catch(() => null);
        mailed = result ? (result.dryRun ? 'dry-run' : 'sent') : 'skipped';
      }
    }

    revalidatePath('/console', 'layout');
    return { saved: isEdit ? '답변을 수정했습니다.' : '답변을 저장했습니다.', mailed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : '답변 저장에 실패했습니다.' };
  }
}

function buildReplyHtml(subject: string, answer: string, supportEmail: string): string {
  const escaped = answer.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.7;color:#1a1d23;max-width:600px">
      <h2 style="font-size:18px;margin:0 0 4px">문의 답변</h2>
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px">문의 제목: ${subject}</p>
      <div style="white-space:pre-wrap;background:#f6f7f9;border-radius:12px;padding:16px;font-size:14px">${escaped}</div>
      <p style="color:#6b7280;font-size:12px;margin-top:24px">
        추가로 궁금한 점이 있으면 ${supportEmail ? `<a href="mailto:${supportEmail}">${supportEmail}</a>로 회신하시거나 ` : ''}
        문의하기를 다시 이용해 주세요.
      </p>
    </div>`;
}

/* ---------- 트리아지 ---------- */

export async function assignInquiry(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'inquiry.respond');

  const id = String(formData.get('id') ?? '');
  const assigneeId = String(formData.get('assigneeId') ?? '') || null;
  const target = await prisma.inquiry.findUnique({ where: { id }, select: { subject: true } });
  if (!target) return;

  await prisma.inquiry.update({ where: { id }, data: { assigneeId } });
  const name = assigneeId
    ? ((await prisma.user.findUnique({ where: { id: assigneeId }, select: { name: true } }))?.name ?? '알 수 없음')
    : null;

  await audit({
    actor: caller,
    action: 'inquiry.assign',
    targetType: 'inquiry',
    targetId: id,
    summary: name ? `담당자 → ${name} (${target.subject.slice(0, 40)})` : `담당자 지정 해제 (${target.subject.slice(0, 40)})`,
  });
  revalidatePath('/console/inquiries');
}

/** 분류·우선순위 — 큐를 훑을 때 무엇부터 볼지 정하는 값. */
export async function classifyInquiry(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'inquiry.respond');

  const id = String(formData.get('id') ?? '');
  const category = String(formData.get('category') ?? '');
  const priority = String(formData.get('priority') ?? 'normal');
  if (!(INQUIRY_CATEGORIES as readonly string[]).includes(category)) return;
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) return;

  await prisma.inquiry.update({ where: { id }, data: { category, priority } }).catch(() => {});
  revalidatePath('/console/inquiries');
}

/** 보관 — 답변이 끝나 더 볼 일이 없는 건을 큐에서 내린다. */
export async function closeInquiry(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'inquiry.respond');

  const id = String(formData.get('id') ?? '');
  const target = await prisma.inquiry.findUnique({ where: { id }, select: { subject: true } });
  if (!target) return;

  await prisma.inquiry.update({ where: { id }, data: { status: 'closed' } });
  await audit({
    actor: caller,
    action: 'inquiry.close',
    targetType: 'inquiry',
    targetId: id,
    summary: `문의 보관 — ${target.subject.slice(0, 60)}`,
  });
  revalidatePath('/console', 'layout');
}

/** 재개 — 보관했는데 다시 다뤄야 할 때. 답변은 지우지 않는다. */
export async function reopenInquiry(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'inquiry.respond');

  const id = String(formData.get('id') ?? '');
  const target = await prisma.inquiry.findUnique({ where: { id }, select: { subject: true } });
  if (!target) return;

  await prisma.inquiry.update({ where: { id }, data: { status: 'open' } });
  await audit({
    actor: caller,
    action: 'inquiry.reopen',
    targetType: 'inquiry',
    targetId: id,
    summary: `문의 재개 — ${target.subject.slice(0, 60)}`,
  });
  revalidatePath('/console', 'layout');
}
