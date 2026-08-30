// 이메일 인증코드 — 발급·검증.
//
// Supabase Auth의 매직링크와 별개로 두는 이유:
//   · 복구 이메일 등록처럼 "이 주소를 실제로 받아볼 수 있는가"만 확인하면 되는 곳이 있다.
//     그때마다 Auth 계정을 만들 수는 없다.
//   · 링크는 메일 클라이언트가 미리 열어 버려 한 번 쓰고 소모되는 사고가 있다. 6자리 코드는
//     사람이 옮겨 적어야 해서 그 문제가 없다.
//
// 저장 원칙: 평문 코드는 남기지 않는다(sha256만). DB가 새더라도 코드 자체는 못 쓴다.
import { prisma } from './prisma';
import { sendMail } from './email';
import { isEnabled } from './settings';

export const CODE_LENGTH = 6;
export const CODE_TTL_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
/** 같은 주소로 코드를 다시 받기까지 기다려야 하는 시간 */
export const RESEND_COOLDOWN_SECONDS = 60;

export type VerificationPurpose =
  | 'signup'
  | 'recovery_email'
  | 'email_change'
  | 'login_2fa'
  | 'password_reset';

const PURPOSE_SUBJECT: Record<VerificationPurpose, string> = {
  signup: '[debateCode] 이메일 인증 코드',
  recovery_email: '[debateCode] 복구 이메일 확인 코드',
  email_change: '[debateCode] 이메일 변경 확인 코드',
  login_2fa: '[debateCode] 로그인 확인 코드',
  password_reset: '[debateCode] 비밀번호 재설정',
};

const PURPOSE_INTRO: Record<VerificationPurpose, string> = {
  signup: '회원가입을 완료하려면 아래 코드를 입력해 주세요.',
  recovery_email: '이 주소를 복구 이메일로 등록하려면 아래 코드를 입력해 주세요.',
  email_change: '이메일 변경을 확인하려면 아래 코드를 입력해 주세요.',
  login_2fa: '로그인을 마치려면 아래 코드를 입력해 주세요. 본인이 로그인한 것이 아니라면 비밀번호를 즉시 바꿔 주세요.',
  password_reset: '아래 버튼을 눌러 새 비밀번호를 설정해 주세요.',
};

/** 숫자 6자리 — 헷갈리는 문자를 섞지 않으려고 숫자만 쓴다. */
function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(bytes[0] % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, '0');
}

async function hashCode(code: string, email: string): Promise<string> {
  // 이메일을 함께 넣어 같은 코드라도 주소가 다르면 다른 해시가 되게 한다
  const data = new TextEncoder().encode(`${email.toLowerCase()}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface IssueResult {
  ok: boolean;
  error?: string;
  /** 메일 키가 없어 실제로 발송되지 않은 경우 — 화면에 그대로 알려야 한다 */
  dryRun?: boolean;
  /** 개발 편의: dry-run일 때만 코드를 돌려준다. 운영에서는 절대 나가지 않는다. */
  devCode?: string;
}

/**
 * 코드 발급 후 메일 발송.
 * 같은 목적의 이전 코드는 무효화한다 — 두 개가 동시에 살아 있으면 어느 것이 맞는지 알 수 없다.
 */
export async function issueCode(
  email: string,
  purpose: VerificationPurpose,
  userId?: string,
): Promise<IssueResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return { ok: false, error: '이메일 주소를 확인해 주세요.' };

  // 재발송 쿨다운 — 메일 폭탄과 발송 비용을 함께 막는다
  const recent = await prisma.emailVerification.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent) {
    const elapsed = (Date.now() - recent.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      return { ok: false, error: `${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed)}초 후에 다시 요청할 수 있습니다.` };
    }
  }

  const code = generateCode();
  const codeHash = await hashCode(code, normalized);

  await prisma.$transaction([
    // 이전 미사용 코드를 소모 처리 — 살아 있는 코드는 항상 하나만
    prisma.emailVerification.updateMany({
      where: { email: normalized, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.emailVerification.create({
      data: {
        email: normalized,
        codeHash,
        purpose,
        userId: userId ?? null,
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
      },
    }),
  ]);

  if (!(await isEnabled('integration.email_enabled'))) {
    return { ok: true, dryRun: true, devCode: code };
  }

  const result = await sendMail({
    to: normalized,
    subject: PURPOSE_SUBJECT[purpose],
    html: codeEmailHtml(code, PURPOSE_INTRO[purpose]),
  }).catch(() => null);

  if (!result) return { ok: false, error: '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  // dry-run이면 코드를 화면에 돌려준다 — 그러지 않으면 개발·점검 중에 가입 자체가 막힌다
  return { ok: true, dryRun: result.dryRun, devCode: result.dryRun ? code : undefined };
}

function codeEmailHtml(code: string, intro: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.7;color:#1a1d23;max-width:480px">
      <h2 style="font-size:18px;margin:0 0 8px">이메일 인증</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#4b5563">${intro}</p>
      <div style="background:#f6f7f9;border-radius:12px;padding:20px;text-align:center">
        <span style="font-family:ui-monospace,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1800AC">${code}</span>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280">
        코드는 ${CODE_TTL_MINUTES}분간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시해 주세요.
      </p>
    </div>`;
}

/* ---------- 링크 토큰 (비밀번호 재설정) ---------- */

/** 링크 토큰은 사람이 옮겨 적지 않는다 — 짧게 만들 이유가 없으므로 32바이트로 둔다. */
export const LINK_TOKEN_TTL_MINUTES = 30;

function generateLinkToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // base64url — 주소에 그대로 넣을 수 있어야 한다
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface IssueLinkResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  /** dry-run일 때만 — 개발 중에 흐름이 막히지 않도록 */
  devUrl?: string;
}

/**
 * 재설정 링크 발급 후 메일 발송.
 *
 * 코드(6자리) 대신 토큰을 쓰는 이유 — 비밀번호 재설정은 "메일함을 실제로 여는 사람"만
 * 통과해야 하고, 그 확인은 링크 한 번이면 끝난다. 6자리를 옮겨 적게 하면 단계만 늘어난다.
 * 저장은 코드와 같다: 평문은 남기지 않고 sha256만 둔다.
 *
 * **주소가 가입돼 있는지는 알려 주지 않는다.** 호출부가 언제나 "보냈다"고 답하고,
 * 없는 주소면 여기서 조용히 아무것도 하지 않는다 — 가입 여부를 캐는 통로를 막는다.
 */
export async function issueResetLink(
  email: string,
  userId: string,
  siteUrl: string,
): Promise<IssueLinkResult> {
  const normalized = email.trim().toLowerCase();
  const token = generateLinkToken();
  const codeHash = await hashCode(token, normalized);

  await prisma.$transaction([
    prisma.emailVerification.updateMany({
      where: { email: normalized, purpose: 'password_reset', consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.emailVerification.create({
      data: {
        email: normalized,
        codeHash,
        purpose: 'password_reset',
        userId,
        expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MINUTES * 60_000),
      },
    }),
  ]);

  const url = `${siteUrl.replace(/\/$/, '')}/reset-password?token=${token}&email=${encodeURIComponent(normalized)}`;

  if (!(await isEnabled('integration.email_enabled'))) {
    return { ok: true, dryRun: true, devUrl: url };
  }

  const result = await sendMail({
    to: normalized,
    subject: PURPOSE_SUBJECT.password_reset,
    html: resetEmailHtml(url),
  }).catch(() => null);

  if (!result) return { ok: false, error: '메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
  return { ok: true, dryRun: result.dryRun, devUrl: result.dryRun ? url : undefined };
}

function resetEmailHtml(url: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.7;color:#1a1d23;max-width:480px">
      <h2 style="font-size:18px;margin:0 0 8px">비밀번호 재설정</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#4b5563">${PURPOSE_INTRO.password_reset}</p>
      <a href="${url}" style="display:inline-block;background:#4531d9;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px">
        새 비밀번호 설정하기
      </a>
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280;word-break:break-all">
        버튼이 눌리지 않으면 이 주소를 복사해 여세요.<br />${url}
      </p>
      <p style="margin:12px 0 0;font-size:12px;color:#6b7280">
        링크는 ${LINK_TOKEN_TTL_MINUTES}분간 유효하며 한 번만 쓸 수 있습니다.
        본인이 요청하지 않았다면 이 메일을 무시해 주세요 — 비밀번호는 그대로입니다.
      </p>
    </div>`;
}

/**
 * 재설정 토큰 확인. 성공하면 그 토큰은 즉시 소모되고 대상 계정 id를 돌려준다.
 *
 * 소모를 먼저 하는 이유 — 비밀번호 변경이 실패하더라도 토큰은 이미 쓴 것으로 본다.
 * 같은 링크를 여러 번 시도하게 두면 무차별 대입의 창이 열린다.
 */
export async function consumeResetToken(
  email: string,
  token: string,
): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!token || token.length < 20) return { ok: false, error: '링크가 올바르지 않습니다. 다시 요청해 주세요.' };

  const record = await prisma.emailVerification.findFirst({
    where: { email: normalized, purpose: 'password_reset', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return { ok: false, error: '링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.' };

  if (record.expiresAt < new Date()) {
    await prisma.emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, error: '링크가 만료되었습니다. 다시 요청해 주세요.' };
  }

  const hash = await hashCode(token, normalized);
  if (hash !== record.codeHash) {
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: '링크가 올바르지 않습니다. 다시 요청해 주세요.' };
  }
  if (!record.userId) return { ok: false, error: '계정을 찾지 못했습니다. 다시 요청해 주세요.' };

  await prisma.emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { ok: true, userId: record.userId };
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * 코드 확인. 성공하면 그 코드는 즉시 소모된다.
 *
 * 실패해도 "코드가 틀렸다"와 "그런 요청이 없다"를 구분해 알려 주지 않는다 —
 * 어느 주소로 코드가 발급됐는지 캐낼 수 있는 통로가 되기 때문이다.
 */
export async function verifyCode(
  email: string,
  purpose: VerificationPurpose,
  code: string,
): Promise<VerifyResult> {
  const normalized = email.trim().toLowerCase();
  const record = await prisma.emailVerification.findFirst({
    where: { email: normalized, purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) return { ok: false, error: '인증 코드를 다시 요청해 주세요.' };

  if (record.expiresAt < new Date()) {
    await prisma.emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, error: '코드가 만료되었습니다. 다시 요청해 주세요.' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    return { ok: false, error: '시도 횟수를 초과했습니다. 코드를 다시 요청해 주세요.' };
  }

  const candidate = await hashCode(code.trim(), normalized);
  if (candidate !== record.codeHash) {
    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const left = MAX_ATTEMPTS - record.attempts - 1;
    return { ok: false, error: `코드가 일치하지 않습니다. (남은 시도 ${Math.max(0, left)}회)` };
  }

  await prisma.emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}

/** 만료된 코드 정리 — 조회 시점에 곁다리로 부른다(별도 배치를 두지 않는다). */
export async function purgeExpiredCodes(): Promise<void> {
  await prisma.emailVerification
    .deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600_000) } } })
    .catch(() => null);
}
