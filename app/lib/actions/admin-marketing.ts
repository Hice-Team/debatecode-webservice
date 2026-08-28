'use server';

// 홍보 메일 — 콘솔에서 작성하고 발송한다.
//
// 발송은 되돌릴 수 없다. 그래서 규칙을 세 개 둔다.
//   1) 명단은 MarketingContact만 본다. 동의하지 않은 주소는 어떤 경로로도 섞이지 않는다.
//   2) 모든 메일에 수신자별 수신거부 링크를 넣는다(정보통신망법상 필수).
//   3) 발송 결과는 성공/실패 수까지 기록으로 남긴다 — 몇 명에게 갔는지 나중에 답할 수 있어야 한다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getUser } from '../dal';
import { canGrantRoles } from '../roles';
import { requirePermission } from '../permissions-server';
import { campaignHtml, sendBulk, isEmailLive } from '../email';
import { countAudience, listAudience, isAudience, type Audience } from '../marketing';

export interface CampaignState {
  errors?: { form?: string[] };
  saved?: boolean;
  message?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://debatecode.org';

const campaignSchema = z.object({
  subject: z.string().min(2, '제목을 입력해 주세요.').max(120, '제목이 너무 깁니다.'),
  body: z.string().min(10, '본문은 10자 이상이어야 합니다.').max(20_000, '본문이 너무 깁니다.'),
  audience: z.string().refine(isAudience, '발송 대상이 올바르지 않습니다.'),
});

/**
 * 발송 권한 — 홍보 메일은 서비스 밖으로 나가는 유일한 기능이라 가장 높은 권한만 허용한다.
 * 콘솔 접근 권한(리뷰어 등)과 같은 선을 쓰지 않는 이유다.
 */
async function requireSender() {
  const user = await getUser();
  if (!canGrantRoles(user.role)) throw new Error('forbidden');
  await requirePermission(user, 'marketing.send');
  return user;
}
//
// 역할 검사만으로는 부족하다. PermissionGrant의 **개별 차단(deny)** 이 통하지 않기 때문이다.
// 문제가 된 담당자의 권한 하나만 잠그려 해도, 역할만 보는 자리는 그대로 열려 있다 —
// 하필 돈과 발송이 걸린 쪽이 그랬다. requirePermission이 역할 기본값과 오버라이드를
// 함께 판정한다(app/lib/permissions-server.ts).

/** 초안 저장 — 보내기 전에 문구를 다듬을 수 있게 한다 */
export async function saveCampaign(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  let user;
  try {
    user = await requireSender();
  } catch {
    return { errors: { form: ['권한이 없습니다.'] } };
  }

  const parsed = campaignSchema.safeParse({
    subject: formData.get('subject'),
    body: formData.get('body'),
    audience: formData.get('audience'),
  });
  if (!parsed.success) return { errors: { form: parsed.error.issues.map((i) => i.message) } };

  const { subject, body, audience } = parsed.data;
  await prisma.emailCampaign.create({
    data: {
      subject,
      body,
      audience,
      status: 'draft',
      recipientCount: await countAudience(audience as Audience),
      createdById: user.id,
    },
  });

  revalidatePath('/console/marketing');
  return { saved: true, message: '초안을 저장했습니다.' };
}

/**
 * 발송. 이미 보낸 건은 다시 보내지 않는다(status 검사) — 목록에서 두 번 눌러
 * 같은 메일이 두 번 가는 일을 막는다.
 */
export async function sendCampaign(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  try {
    await requireSender();
  } catch {
    return { errors: { form: ['권한이 없습니다.'] } };
  }

  const id = String(formData.get('id') ?? '');
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) return { errors: { form: ['발송 건을 찾을 수 없습니다.'] } };
  if (campaign.status !== 'draft' && campaign.status !== 'failed') {
    return { errors: { form: ['이미 발송했거나 발송 중인 건입니다.'] } };
  }

  const audience = (isAudience(campaign.audience) ? campaign.audience : 'all') as Audience;
  const contacts = await listAudience(audience);
  if (contacts.length === 0) {
    return { errors: { form: ['발송 대상이 없습니다.'] } };
  }

  await prisma.emailCampaign.update({
    where: { id },
    data: { status: 'sending', recipientCount: contacts.length },
  });

  const messages = contacts.map((contact) => {
    const unsubscribeUrl = `${SITE_URL}/unsubscribe?token=${contact.unsubscribeToken}`;
    return {
      to: contact.email,
      subject: campaign.subject,
      html: campaignHtml({ subject: campaign.subject, bodyMarkdown: campaign.body, unsubscribeUrl }),
      unsubscribeUrl,
    };
  });

  const result = await sendBulk(messages);

  await prisma.emailCampaign.update({
    where: { id },
    data: {
      status: result.dryRun ? 'draft' : result.sent > 0 ? 'sent' : 'failed',
      sentCount: result.sent,
      failedCount: result.failed,
      sentAt: result.dryRun || result.sent === 0 ? null : new Date(),
      errorMessage: result.dryRun ? '발송 키(RESEND_API_KEY)가 없어 실제로 보내지 않았습니다.' : null,
    },
  });

  // 마지막 발송 시각 — 같은 사람에게 너무 자주 보내지 않았는지 확인할 근거가 된다
  if (!result.dryRun && result.sent > 0) {
    await prisma.marketingContact.updateMany({
      where: { id: { in: contacts.map((c) => c.id) } },
      data: { lastSentAt: new Date() },
    });
  }

  revalidatePath('/console/marketing');
  if (result.dryRun) {
    return {
      saved: true,
      message: `발송 키가 없어 실제로 보내지 않았습니다. 대상 ${contacts.length.toLocaleString()}명이 확인되었습니다.`,
    };
  }
  return {
    saved: true,
    message: `${result.sent.toLocaleString()}명에게 발송했습니다.${result.failed > 0 ? ` (실패 ${result.failed}건)` : ''}`,
  };
}

/** 초안 삭제 — 보낸 건은 기록이므로 지우지 않는다 */
export async function deleteCampaign(formData: FormData): Promise<void> {
  await requireSender();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await prisma.emailCampaign.deleteMany({ where: { id, status: { in: ['draft', 'failed'] } } });
  revalidatePath('/console/marketing');
}

/** 발송 환경이 준비됐는지 — 화면이 "실제로 나가는지"를 먼저 알려 준다 */
export async function checkEmailLive(): Promise<boolean> {
  await requireSender();
  return isEmailLive();
}
