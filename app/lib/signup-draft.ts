// 가입 위저드 임시 저장소.
//
// 예전에는 단계마다 곧바로 User를 갱신했다. 그래서 중간에 이탈하면 이름만 있고 프로필은 비어
// 있는, 로그인도 안 되는 반쪽짜리 계정이 남았다. 지금은 **마지막 단계를 마쳐야** 계정이
// 만들어지고, 그전까지 입력한 값은 SignupDraft에만 있다.
//
// 이어하기 열쇠는 두 겹이다:
//   1) 쿠키의 토큰 — 정상 경로. 같은 브라우저로 돌아오면 그대로 이어진다.
//   2) IP — 쿠키를 잃었을 때(브라우저 정리·다른 브라우저)의 보조 수단.
//
// ⚠ IP만으로는 초안을 열어 주지 않는다. 학교·회사처럼 여러 사람이 한 IP를 공유하는 곳에서는
//   남이 시작한 가입 화면에 그 사람의 이메일·생년월일이 그대로 뜨게 되기 때문이다. IP가 맞으면
//   "이어서 진행할 수 있다"는 사실만 알리고, **본인이 이메일을 다시 입력해 일치할 때** 초안을
//   넘겨받는다(adoptDraftByEmail). 남이 맞힐 수 없는 값을 열쇠로 쓰는 셈이다.
import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { clientIp } from './rate-limit';

export const DRAFT_COOKIE = 'dc_signup_draft';
/** 만료까지의 시간. 갱신되지 않는다 — "시작한 지 12시간" 기준. */
export const DRAFT_TTL_HOURS = 12;

type DraftRow = Awaited<ReturnType<typeof prisma.signupDraft.findFirst>>;
export type SignupDraft = NonNullable<DraftRow>;

export interface DraftLookup {
  draft: SignupDraft | null;
  /** IP로만 찾은 초안 — 값을 채워 주지 않고 "이어할 수 있다"만 알린다 */
  resumableByEmail: boolean;
}

/** clientIp()는 알 수 없을 때 'unknown'을 준다 — 그 값으로 묶으면 남남이 한 초안을 공유한다. */
async function ipOrNull(): Promise<string | null> {
  const ip = await clientIp();
  return ip && ip !== 'unknown' ? ip : null;
}

function expiry(): Date {
  return new Date(new Date().getTime() + DRAFT_TTL_HOURS * 3600_000);
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 지금 요청에 해당하는 초안을 찾는다.
 *
 * 만료 정리를 여기서 곁다리로 한다 — 가입 화면은 자주 열리지 않으므로 별도 배치를 두는 것보다
 * 이쪽이 단순하고, Workers에는 어차피 정기 실행이 없다(wrangler.jsonc 주석 참고).
 */
export async function loadDraft(): Promise<DraftLookup> {
  const now = new Date();
  void prisma.signupDraft.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => null);

  const store = await cookies();
  const token = store.get(DRAFT_COOKIE)?.value;

  if (token) {
    const draft = await prisma.signupDraft
      .findFirst({ where: { token, expiresAt: { gt: now } } })
      .catch(() => null);
    if (draft) return { draft, resumableByEmail: false };
  }

  // 쿠키가 없거나 죽었다 — 같은 IP에 살아 있는 초안이 있는지만 확인한다
  const ip = await ipOrNull();
  if (!ip) return { draft: null, resumableByEmail: false };
  const byIp = await prisma.signupDraft
    .findFirst({
      where: { ip, expiresAt: { gt: now }, email: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    })
    .catch(() => null);

  return { draft: null, resumableByEmail: Boolean(byIp) };
}

/** 단계별로 채워 넣는 값. Json 컬럼(interests)은 완료 시점에만 쓰므로 여기에 두지 않는다. */
export interface DraftPatch {
  email?: string | null;
  passwordEnc?: string | null;
  marketing?: boolean;
  consentedAt?: Date | null;
  nickname?: string | null;
  birthdateEnc?: string | null;
  genderEnc?: string | null;
  step?: string;
  userId?: string | null;
}

/** 초안을 만들거나 갱신한다. 없으면 새로 만들고 쿠키를 심는다. */
export async function saveDraft(patch: DraftPatch): Promise<SignupDraft> {
  const store = await cookies();
  const token = store.get(DRAFT_COOKIE)?.value;
  const ip = await ipOrNull();
  const now = new Date();

  if (token) {
    const existing = await prisma.signupDraft.findFirst({ where: { token, expiresAt: { gt: now } } });
    if (existing) {
      return prisma.signupDraft.update({ where: { id: existing.id }, data: { ...patch, ip: ip ?? existing.ip } });
    }
  }

  const fresh = randomToken();
  const created = await prisma.signupDraft.create({
    data: { ...patch, token: fresh, ip, expiresAt: expiry() },
  });
  store.set(DRAFT_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DRAFT_TTL_HOURS * 3600,
    path: '/',
  });
  return created;
}

/**
 * IP가 같은 초안을 이메일 일치로 넘겨받는다.
 *
 * 쿠키를 잃은 본인만 통과하도록, 열쇠는 "같은 IP"가 아니라 "같은 IP + 본인이 아는 이메일"이다.
 */
export async function adoptDraftByEmail(email: string): Promise<SignupDraft | null> {
  const ip = await ipOrNull();
  if (!ip) return null;

  const draft = await prisma.signupDraft.findFirst({
    where: { ip, email: email.trim().toLowerCase(), expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: 'desc' },
  });
  if (!draft) return null;

  const store = await cookies();
  store.set(DRAFT_COOKIE, draft.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DRAFT_TTL_HOURS * 3600,
    path: '/',
  });
  return draft;
}

/** 가입 완료·취소 시 초안과 쿠키를 함께 없앤다. 비밀번호가 들어 있으니 미루지 않는다. */
export async function discardDraft(id?: string): Promise<void> {
  const store = await cookies();
  const token = store.get(DRAFT_COOKIE)?.value;
  if (id) await prisma.signupDraft.deleteMany({ where: { id } }).catch(() => null);
  else if (token) await prisma.signupDraft.deleteMany({ where: { token } }).catch(() => null);
  store.delete(DRAFT_COOKIE);
}
