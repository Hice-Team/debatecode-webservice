'use server';

// 홍보 메일 — 콘솔에서 작성하고 발송한다.
//
// 발송은 되돌릴 수 없다. 그래서 규칙을 세 개 둔다.
//   1) 명단은 MarketingContact만 본다. 동의하지 않은 주소는 어떤 경로로도 섞이지 않는다.
//   2) 모든 메일에 수신자별 수신거부 링크를 넣는다(정보통신망법상 필수).
//   3) 발송 결과는 **수신자 단위로** 남긴다. 합계만 남기면 "실패 3건"을 보고 할 수 있는
//      일이 없다 — 누가 실패했는지 알아야 그 사람들에게만 다시 보낸다.
//
// 대상 조건(회원 여부·동의 경로·동의 시점·피로도 제외)은 미리보기와 실제 발송이
// **같은 함수**(marketing.ts의 audienceWhere)를 쓴다. 두 곳에 따로 쓰면 "300명"이라고
// 보여 준 뒤 다른 사람들에게 나가는 사고가 되고, 그건 되돌릴 수 없다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '../prisma';
import { getUser } from '../dal';
import { canGrantRoles } from '../roles';
import { requirePermission } from '../permissions-server';
import { campaignHtml, sendBulk, isEmailLive } from '../email';
import {
  countAudience,
  listAudience,
  sampleAudience,
  isAudience,
  toFilters,
  type AudienceFilters,
} from '../marketing';

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

/** 폼에서 온 대상 조건 — 모르는 값은 "가리지 않음"으로 떨어진다 */
function filtersFromForm(formData: FormData): AudienceFilters {
  return toFilters({
    audience: formData.get('audience'),
    source: formData.get('source'),
    consentedWithinDays: formData.get('consentedWithinDays'),
    excludeSentWithinDays: formData.get('excludeSentWithinDays'),
  });
}

/** 캠페인 행에 저장된 조건을 되살린다 — 저장할 때와 보낼 때가 같아야 한다 */
function filtersFromCampaign(c: {
  audience: string;
  sourceFilter: string | null;
  consentedWithinDays: number | null;
  excludeSentWithinDays: number | null;
}): AudienceFilters {
  return toFilters({
    audience: c.audience,
    source: c.sourceFilter,
    consentedWithinDays: c.consentedWithinDays,
    excludeSentWithinDays: c.excludeSentWithinDays,
  });
}

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

  const { subject, body } = parsed.data;
  const filters = filtersFromForm(formData);
  const recipientCount = await countAudience(filters);

  await prisma.emailCampaign.create({
    data: {
      subject,
      body,
      audience: filters.audience,
      sourceFilter: filters.source,
      consentedWithinDays: filters.consentedWithinDays,
      excludeSentWithinDays: filters.excludeSentWithinDays,
      status: 'draft',
      recipientCount,
      createdById: user.id,
    },
  });

  revalidatePath('/console/marketing');
  return {
    saved: true,
    message:
      recipientCount === 0
        ? '초안을 저장했습니다. 지금 조건에 맞는 대상이 없어 이대로는 보낼 수 없습니다.'
        : `초안을 저장했습니다. 지금 조건이면 ${recipientCount.toLocaleString()}명입니다.`,
  };
}

/**
 * 대상 미리보기 — 수만 보여 주면 조건이 맞는지 확인할 방법이 없다.
 * 실제로 들어올 주소 몇 개를 함께 돌려준다.
 */
export async function previewAudience(filtersInput: {
  audience?: string;
  source?: string | null;
  consentedWithinDays?: number | null;
  excludeSentWithinDays?: number | null;
}): Promise<{
  count: number;
  sample: { email: string; member: boolean; source: string; lastSentAt: string | null }[];
}> {
  await requireSender();
  const filters = toFilters(filtersInput);
  const [count, sample] = await Promise.all([countAudience(filters), sampleAudience(filters)]);
  return {
    count,
    sample: sample.map((c) => ({
      email: c.email,
      member: Boolean(c.userId),
      source: c.source,
      lastSentAt: c.lastSentAt ? c.lastSentAt.toISOString() : null,
    })),
  };
}

/**
 * 실제 발송 한 번. 대상 목록을 받아 보내고, 결과를 수신자 단위로 남긴다.
 *
 * 첫 발송과 재발송이 같은 코드를 쓴다 — 재발송에만 있는 버그를 만들지 않기 위해서다.
 */
async function deliver(
  campaign: { id: string; subject: string; body: string },
  contacts: { id: string; email: string; unsubscribeToken: string }[],
  attempt: number,
) {
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

  // 결과 기록. dry-run은 실제로 나가지 않았으므로 발송 기록을 남기지 않는다 —
  // 남기면 "보냈다"는 거짓 기록이 되고, 재발송 대상에서도 빠진다.
  if (!result.dryRun && result.results.length > 0) {
    const contactByEmail = new Map(contacts.map((c) => [c.email, c] as const));
    await prisma.$transaction(
      result.results.map((r) =>
        prisma.emailDelivery.upsert({
          where: { campaignId_email: { campaignId: campaign.id, email: r.to } },
          create: {
            campaignId: campaign.id,
            contactId: contactByEmail.get(r.to)?.id ?? null,
            email: r.to,
            status: r.ok ? 'sent' : 'failed',
            error: r.error ?? null,
            attempt,
          },
          update: {
            status: r.ok ? 'sent' : 'failed',
            error: r.error ?? null,
            attempt,
            createdAt: new Date(),
          },
        }),
      ),
    );
  }

  // 마지막 발송 시각 — 같은 사람에게 너무 자주 보내지 않았는지 확인할 근거가 된다.
  // 실제로 도착한 사람에게만 찍는다(실패한 사람은 받지 않았다).
  if (!result.dryRun && result.sent > 0) {
    const okEmails = new Set(result.results.filter((r) => r.ok).map((r) => r.to));
    const okIds = contacts.filter((c) => okEmails.has(c.email)).map((c) => c.id);
    if (okIds.length > 0) {
      await prisma.marketingContact.updateMany({
        where: { id: { in: okIds } },
        data: { lastSentAt: new Date() },
      });
    }
  }

  return result;
}

/**
 * 발송. 이미 보낸 건은 다시 보내지 않는다(status 검사) — 목록에서 두 번 눌러
 * 같은 메일이 두 번 가는 일을 막는다.
 *
 * 실패 후 다시 누른 경우에도, **이미 도착한 사람은 대상에서 뺀다**. 예전에는
 * 조건에 맞는 전원에게 다시 보내서 성공했던 사람이 같은 메일을 두 번 받았다.
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

  // 저장할 때의 조건 그대로 — 대상은 지금 명단을 다시 읽어 정한다.
  // 그 사이 수신거부한 사람은 여기서 자동으로 빠진다.
  const filters = filtersFromCampaign(campaign);
  const all = await listAudience(filters);

  const alreadySent = await prisma.emailDelivery.findMany({
    where: { campaignId: id, status: 'sent' },
    select: { email: true },
  });
  const sentSet = new Set(alreadySent.map((d) => d.email));
  const contacts = all.filter((c) => !sentSet.has(c.email));

  if (contacts.length === 0) {
    return {
      errors: {
        form: [
          sentSet.size > 0
            ? '조건에 맞는 대상에게는 이미 모두 발송했습니다.'
            : '지금 조건에 맞는 발송 대상이 없습니다.',
        ],
      },
    };
  }

  await prisma.emailCampaign.update({
    where: { id },
    data: { status: 'sending', recipientCount: sentSet.size + contacts.length },
  });

  // 발송 중에 예외가 나면 status가 'sending'에 멈춘다. 그 상태에서는 발송도
  // 재발송도 막혀 있어 사람이 손댈 방법이 없다 — 반드시 되돌려 놓는다.
  let result;
  try {
    result = await deliver(campaign, contacts, 1);
  } catch (error) {
    await prisma.emailCampaign.update({
      where: { id },
      data: {
        status: 'failed',
        errorMessage:
          error instanceof Error ? error.message : '발송 중 알 수 없는 오류가 발생했습니다.',
      },
    });
    revalidatePath('/console/marketing');
    return { errors: { form: ['발송에 실패했습니다. 아래 목록에서 사유를 확인하고 다시 시도해 주세요.'] } };
  }

  const totalSent = sentSet.size + result.sent;
  await prisma.emailCampaign.update({
    where: { id },
    data: {
      status: result.dryRun ? 'draft' : totalSent > 0 ? 'sent' : 'failed',
      sentCount: totalSent,
      failedCount: result.failed,
      sentAt: result.dryRun || totalSent === 0 ? null : new Date(),
      errorMessage: result.dryRun
        ? '발송 수단(SMTP·Resend)이 없어 실제로 보내지 않았습니다.'
        : (result.error ?? null),
    },
  });

  revalidatePath('/console/marketing');
  if (result.dryRun) {
    return {
      saved: true,
      message: `발송 수단이 없어 실제로 보내지 않았습니다. 대상 ${contacts.length.toLocaleString()}명이 확인되었습니다.`,
    };
  }
  return {
    saved: true,
    message: `${result.sent.toLocaleString()}명에게 발송했습니다.${
      result.failed > 0 ? ` 실패 ${result.failed}건은 아래에서 다시 보낼 수 있습니다.` : ''
    }`,
  };
}

/**
 * 실패분만 다시 보낸다.
 *
 * 성공한 사람은 건드리지 않는다 — 전체 재발송은 이미 받은 사람에게 같은 메일을
 * 두 번 보내는 일이고, 그게 수신거부로 이어진다.
 *
 * 그 사이 수신거부한 사람은 다시 대상에 넣지 않는다. 지금 명단(listAudience)에
 * 남아 있는 주소만 대상으로 잡는 이유다.
 */
export async function resendFailed(_prev: CampaignState, formData: FormData): Promise<CampaignState> {
  try {
    await requireSender();
  } catch {
    return { errors: { form: ['권한이 없습니다.'] } };
  }

  const id = String(formData.get('id') ?? '');
  const campaign = await prisma.emailCampaign.findUnique({ where: { id } });
  if (!campaign) return { errors: { form: ['발송 건을 찾을 수 없습니다.'] } };
  if (campaign.status === 'sending') {
    return { errors: { form: ['발송 중입니다. 끝난 뒤에 다시 시도해 주세요.'] } };
  }

  const failed = await prisma.emailDelivery.findMany({
    where: { campaignId: id, status: 'failed' },
    select: { email: true, attempt: true },
  });
  if (failed.length === 0) return { errors: { form: ['다시 보낼 실패 건이 없습니다.'] } };

  // 지금도 수신 동의 상태인 주소만 — 그 사이 철회했다면 다시 보내지 않는다
  const stillSubscribed = await prisma.marketingContact.findMany({
    where: { email: { in: failed.map((f) => f.email) }, unsubscribedAt: null },
    select: { id: true, email: true, unsubscribeToken: true },
  });

  const withdrawn = failed.length - stillSubscribed.length;
  if (stillSubscribed.length === 0) {
    return { errors: { form: ['실패한 주소가 모두 수신을 철회해 다시 보낼 수 없습니다.'] } };
  }

  const attempt = Math.max(...failed.map((f) => f.attempt)) + 1;
  const result = await deliver(campaign, stillSubscribed, attempt);

  const [sentTotal, failedTotal] = await Promise.all([
    prisma.emailDelivery.count({ where: { campaignId: id, status: 'sent' } }),
    prisma.emailDelivery.count({ where: { campaignId: id, status: 'failed' } }),
  ]);

  await prisma.emailCampaign.update({
    where: { id },
    data: {
      status: sentTotal > 0 ? 'sent' : 'failed',
      sentCount: sentTotal,
      failedCount: failedTotal,
      errorMessage: result.error ?? null,
      ...(sentTotal > 0 && !campaign.sentAt ? { sentAt: new Date() } : {}),
    },
  });

  revalidatePath('/console/marketing');
  if (result.dryRun) {
    return { saved: true, message: '발송 수단이 없어 실제로 보내지 않았습니다.' };
  }
  return {
    saved: true,
    message: `다시 보냈습니다. 성공 ${result.sent.toLocaleString()}건${
      result.failed > 0 ? ` · 여전히 실패 ${result.failed}건` : ''
    }${withdrawn > 0 ? ` · 그 사이 수신을 철회한 ${withdrawn}명은 제외했습니다.` : ''}`,
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
