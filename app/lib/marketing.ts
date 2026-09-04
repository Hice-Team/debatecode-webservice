// 마케팅 수신 동의 명단 — 동의/철회를 한 곳에서만 다룬다.
//
// 동의는 여러 경로에서 들어온다(가입 폼, OAuth 콜백, 설정 화면). 각자 upsert를 짜면 곧 규칙이
// 갈리므로 여기에 모은다. 철회는 행을 지우지 않고 unsubscribedAt을 채운다 — "동의한 적 있는
// 사람이 언제 철회했는지"는 정보통신망법상 남겨 두어야 하는 기록이다.
import { prisma } from './prisma';
import { DEFAULT_FILTERS, type Audience, type AudienceFilters } from './marketing-audience';

// 순수 값은 marketing-audience.ts에 있다 — 클라이언트 컴포넌트가 prisma를 끌어오지 않도록.
export {
  AUDIENCE_LABELS,
  SOURCE_LABELS,
  CONSENT_WINDOWS,
  FATIGUE_WINDOWS,
  DEFAULT_FILTERS,
  isAudience,
  isConsentSource,
  toFilters,
  describeFilters,
  type Audience,
  type AudienceFilters,
  type ConsentSourceFilter,
} from './marketing-audience';

export type ConsentSource = 'signup' | 'settings' | 'launch_notify' | 'manual';

/** 수신거부 링크에 실리는 토큰 — 추측할 수 없어야 한다 */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 동의 등록. 이미 있으면 다시 동의한 것으로 보고 철회 표시를 지운다.
 * 실패해도 부르는 쪽(가입 등)을 막지 않는다 — 명단 등록이 회원가입을 실패시킬 이유는 없다.
 */
export async function addMarketingConsent(input: {
  email: string;
  name?: string | null;
  userId?: string | null;
  source?: ConsentSource;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email) return;

  try {
    await prisma.marketingContact.upsert({
      where: { email },
      create: {
        email,
        name: input.name ?? null,
        userId: input.userId ?? null,
        source: input.source ?? 'signup',
        unsubscribeToken: newToken(),
      },
      update: {
        name: input.name ?? undefined,
        userId: input.userId ?? undefined,
        consentedAt: new Date(),
        unsubscribedAt: null,
      },
    });
  } catch {
    // 명단 등록 실패는 조용히 넘긴다 — 동의 시각은 User에도 남아 있어 복구할 수 있다
  }
}

/** 동의 철회 — 발송 대상에서 즉시 빠진다 */
export async function withdrawMarketingConsent(email: string): Promise<void> {
  try {
    await prisma.marketingContact.updateMany({
      where: { email: email.trim().toLowerCase(), unsubscribedAt: null },
      data: { unsubscribedAt: new Date() },
    });
  } catch {
    // ignore
  }
}

/** 토큰으로 수신거부 — 로그인 없이 링크 한 번으로 처리된다 */
export async function unsubscribeByToken(token: string): Promise<{ ok: boolean; email?: string }> {
  if (!token) return { ok: false };
  const contact = await prisma.marketingContact.findUnique({
    where: { unsubscribeToken: token },
    select: { id: true, email: true, unsubscribedAt: true },
  });
  if (!contact) return { ok: false };

  if (!contact.unsubscribedAt) {
    await prisma.marketingContact.update({ where: { id: contact.id }, data: { unsubscribedAt: new Date() } });
    // 회원이면 계정 쪽 동의 시각도 함께 지운다 — 두 곳의 상태가 갈리면 안 된다
    await prisma.user.updateMany({ where: { email: contact.email }, data: { marketingConsentAt: null } });
  }
  return { ok: true, email: contact.email };
}

/**
 * 대상 조건 → Prisma where.
 *
 * **미리보기와 실제 발송이 반드시 같은 함수를 쓴다.** 두 곳에 따로 쓰면 조건이
 * 갈리고, 그때는 "300명"이라고 보여 준 뒤 다른 사람들에게 나가는 사고가 된다.
 * 되돌릴 수 없는 동작이므로 여기 한 곳만 둔다.
 */
function audienceWhere(f: AudienceFilters) {
  const now = new Date();
  const since = (days: number) => new Date(now.getTime() - days * 86400_000);

  return {
    // 동의를 철회한 사람은 어떤 조건으로도 다시 들어오지 않는다
    unsubscribedAt: null,
    ...(f.audience === 'members' ? { userId: { not: null } } : {}),
    ...(f.audience === 'guests' ? { userId: null } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(f.consentedWithinDays ? { consentedAt: { gte: since(f.consentedWithinDays) } } : {}),
    // 아직 한 번도 안 받은 사람(lastSentAt = null)은 제외 대상이 아니다
    ...(f.excludeSentWithinDays
      ? { OR: [{ lastSentAt: null }, { lastSentAt: { lt: since(f.excludeSentWithinDays) } }] }
      : {}),
  };
}

/** 발송 대상 수 — 보내기 전에 몇 명인지 먼저 보여 준다 */
export function countAudience(filters: AudienceFilters | Audience): Promise<number> {
  const f = typeof filters === 'string' ? { ...DEFAULT_FILTERS, audience: filters } : filters;
  return prisma.marketingContact.count({ where: audienceWhere(f) });
}

/** 발송 대상 목록 — 주소와 수신거부 토큰만 가져온다 */
export function listAudience(filters: AudienceFilters | Audience) {
  const f = typeof filters === 'string' ? { ...DEFAULT_FILTERS, audience: filters } : filters;
  return prisma.marketingContact.findMany({
    where: audienceWhere(f),
    select: { id: true, email: true, name: true, unsubscribeToken: true },
  });
}

/**
 * 대상 표본 — 수만 보여 주면 조건이 맞는지 확인할 방법이 없다.
 * 실제로 들어오는 주소 몇 개를 함께 보여 준다.
 */
export async function sampleAudience(filters: AudienceFilters, take = 8) {
  return prisma.marketingContact.findMany({
    where: audienceWhere(filters),
    orderBy: { consentedAt: 'desc' },
    take,
    select: { id: true, email: true, userId: true, source: true, lastSentAt: true },
  });
}
