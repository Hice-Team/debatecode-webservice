// 2차 인증 — 등록·검증을 한 곳에 모은다. 서버 전용.
//
// ── 어디에 적용되는가 ───────────────────────────────────────────────────────
//   1. 로그인       2차 인증을 켠 계정은 코드를 통과해야 화면이 열린다.
//   2. 되돌릴 수 없는 동작  회원 탈퇴, 2차 인증 해제, 마지막 보안키 삭제.
//
// 수단은 셋이다 — 인증 앱(TOTP · Google Authenticator 등), 복구 이메일로 받는 코드,
// 복구 키(백업 코드). 하나를 잃어도 나머지로 들어올 수 있어야 한다. 2차 인증에서
// 가장 흔한 사고는 공격자가 뚫는 것이 아니라 **본인이 잠기는 것**이다.
//
// ── 로그인을 어떻게 막는가 ──────────────────────────────────────────────────
// Supabase는 비밀번호가 맞는 순간 세션을 발급한다. 그 앞에 끼어들려면 Supabase의
// MFA(AAL2)로 갈아타야 하고, 그러면 여기 있는 TOTP 비밀키·백업 코드·보안키를 전부
// 그쪽 저장소로 옮겨야 한다. 그래서 반대로 한다 — 세션은 발급되게 두되,
// **통과하지 않은 세션은 아무것도 열지 못하게** 한다(app/lib/dal.ts).
// 이용자가 보는 결과는 같고, 이미 만들어 둔 수단을 그대로 쓴다.
//
// ── 저장 방식 ───────────────────────────────────────────────────────────────
//   TOTP 비밀키   AES-GCM 암호화 (복호화해서 코드를 계산해야 한다 — 어쩔 수 없다)
//   백업 코드     sha256 해시만. 복호화할 이유가 없는 값이다.
//   보안키        공개키와 credentialId. 애초에 비밀이 아니다.
import { authenticator } from 'otplib';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { prisma } from './prisma';
import { decryptSecret } from './crypto';
import { sha256Hex } from './hash';
import { durableRateLimit, retryAfterLabel } from './rate-limit-durable';

/* ---------- 설정 ---------- */

/** 백업 코드 — 10자리 Base32(32비트 → 50비트). 8자리 hex는 온라인 대입 사정권이었다. */
const BACKUP_CODE_BYTES = 8;
export const BACKUP_CODE_COUNT = 10;

/** 챌린지 수명 — 발급 시각이 없으면 한 번 만든 챌린지가 영원히 유효해진다. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** 2차 인증 검증 시도 — 계정당 15분에 5회. DB에 남는 카운터라 인스턴스가 바뀌어도 센다. */
const VERIFY_LIMIT = 5;
const VERIFY_WINDOW_MS = 15 * 60 * 1000;

export function webauthnRpId(): string {
  const explicit = process.env.NEXT_PUBLIC_WEBAUTHN_RPID;
  if (explicit) return explicit;
  try {
    return new URL(process.env.NEXTAUTH_URL || 'http://localhost').hostname;
  } catch {
    return 'localhost';
  }
}

export function webauthnOrigin(): string {
  return process.env.NEXT_PUBLIC_WEBAUTHN_ORIGIN || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

/* ---------- 상태 ---------- */

export interface TwoFactorState {
  totp: boolean;
  backupCodesLeft: number;
  securityKeys: number;
  /** 확인을 마친 복구 이메일 주소(마스킹 전 원문). 없으면 null. */
  recoveryEmail: string | null;
  /** 하나라도 설정돼 있으면 로그인과 되돌릴 수 없는 동작에서 확인을 받는다 */
  any: boolean;
}

export async function getTwoFactorState(userId: string): Promise<TwoFactorState> {
  const [user, backupCodesLeft, securityKeys] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorRecoveryEmail: true,
        twoFactorRecoveryEmailVerifiedAt: true,
      },
    }),
    prisma.backupCode.count({ where: { userId, used: false } }),
    prisma.webauthnKey.count({ where: { userId } }),
  ]);
  const totp = !!user?.twoFactorEnabled && !!user.twoFactorSecret;
  // 등록만 하고 코드로 확인하지 않은 주소는 수단으로 치지 않는다 —
  // 오타 난 주소를 복구 수단으로 믿고 있다가 정작 필요할 때 못 쓰는 것을 막는다.
  const recoveryEmail =
    user?.twoFactorRecoveryEmail && user.twoFactorRecoveryEmailVerifiedAt
      ? user.twoFactorRecoveryEmail
      : null;
  return { totp, backupCodesLeft, securityKeys, recoveryEmail, any: totp || securityKeys > 0 };
}

/** 주소를 그대로 보여 주지 않는다 — 화면에는 어느 주소인지 알아볼 만큼만. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '•••';
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}${'•'.repeat(Math.max(2, local.length - head.length))}@${domain}`;
}

/* ---------- 검증 ---------- */

export type VerifyOutcome = { ok: true } | { ok: false; error: string };

/**
 * 시도 횟수 제한 — 검증 앞단에 반드시 건다.
 *
 * TOTP는 6자리다. 제한이 없으면 백만 번 중 몇 번 맞히면 되는 문제가 되고,
 * 그건 2차 인증이 없는 것과 크게 다르지 않다.
 */
async function gateAttempt(userId: string, kind: string): Promise<VerifyOutcome> {
  const gate = await durableRateLimit(`2fa:${kind}:${userId}`, VERIFY_LIMIT, VERIFY_WINDOW_MS);
  if (gate.allowed) return { ok: true };
  return {
    ok: false,
    error: `확인 시도가 너무 많습니다. ${retryAfterLabel(gate.retryAfterMs)} 뒤에 다시 시도해 주세요.`,
  };
}

/** 인증 앱(TOTP) 코드 확인. */
export async function verifyTotpCode(userId: string, code: string): Promise<VerifyOutcome> {
  const gated = await gateAttempt(userId, 'totp');
  if (!gated.ok) return gated;

  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return { ok: false, error: '6자리 숫자를 입력해 주세요.' };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true, twoFactorEnabled: true },
  });
  if (!user?.twoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, error: '인증 앱이 등록되어 있지 않습니다.' };
  }
  const secret = await decryptSecret(user.twoFactorSecret);
  if (!secret) return { ok: false, error: '인증 정보를 읽지 못했습니다. 운영자에게 문의해 주세요.' };

  return authenticator.check(clean, secret)
    ? { ok: true }
    : { ok: false, error: '코드가 맞지 않습니다. 앱에 표시된 최신 코드를 입력해 주세요.' };
}

/**
 * 백업 코드 확인 — 맞으면 그 코드를 소진 처리한다.
 *
 * 해시로만 저장하므로 원문을 대조하는 것이 아니라 해시를 찾는다. 소진은
 * `updateMany(used: false)`의 영향 행 수로 판정한다 — 같은 코드를 동시에 두 번
 * 보내도 한 번만 통과한다.
 */
export async function consumeBackupCode(userId: string, code: string): Promise<VerifyOutcome> {
  const gated = await gateAttempt(userId, 'backup');
  if (!gated.ok) return gated;

  const clean = code.replace(/[\s-]/g, '').toUpperCase();
  if (clean.length < 8) return { ok: false, error: '백업 코드를 확인해 주세요.' };

  const codeHash = await sha256Hex(clean);
  const claimed = await prisma.backupCode.updateMany({
    where: { userId, codeHash, used: false },
    data: { used: true, usedAt: new Date() },
  });
  return claimed.count === 1
    ? { ok: true }
    : { ok: false, error: '사용할 수 없는 백업 코드입니다. 이미 쓴 코드일 수 있습니다.' };
}

/* ---------- 복구 이메일로 받는 코드 ---------- */

/**
 * 복구 이메일로 6자리 코드를 보낸다.
 *
 * 인증 앱을 잃었을 때의 길이다. 그래서 **확인을 마친 주소**로만 보낸다 —
 * 등록만 하고 확인하지 않은 주소로 보내면, 오타 난 주소에 코드를 던지고
 * 이용자는 영영 들어오지 못한다.
 */
export async function sendRecoveryEmailCode(
  userId: string,
): Promise<{ ok: true; sentTo: string; devCode?: string } | { ok: false; error: string }> {
  const state = await getTwoFactorState(userId);
  if (!state.recoveryEmail) {
    return { ok: false, error: '확인된 복구 이메일이 없습니다. 다른 방법으로 로그인해 주세요.' };
  }

  const gate = await durableRateLimit(`2fa:recovery-send:${userId}`, 5, 60 * 60 * 1000);
  if (!gate.allowed) {
    return { ok: false, error: `발송이 너무 잦습니다. ${retryAfterLabel(gate.retryAfterMs)} 뒤에 다시 시도해 주세요.` };
  }

  const { issueCode } = await import('./verification');
  const result = await issueCode(state.recoveryEmail, 'login_2fa', userId);
  if (!result.ok) return { ok: false, error: result.error ?? '코드를 보내지 못했습니다.' };

  return { ok: true, sentTo: maskEmail(state.recoveryEmail), devCode: result.devCode };
}

export async function verifyRecoveryEmailCode(userId: string, code: string): Promise<VerifyOutcome> {
  const gated = await gateAttempt(userId, 'recovery-email');
  if (!gated.ok) return gated;

  const state = await getTwoFactorState(userId);
  if (!state.recoveryEmail) return { ok: false, error: '확인된 복구 이메일이 없습니다.' };

  const { verifyCode } = await import('./verification');
  const result = await verifyCode(state.recoveryEmail, 'login_2fa', code);
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? '코드가 맞지 않습니다.' };
}

/* ---------- 세션 통과 기록 ---------- */

/**
 * 이 세션이 2차 인증을 통과한 것으로 기록한다.
 *
 * 만료를 두는 이유: 한 번 통과했다고 영원히 믿을 수는 없다. 창이 지나면 다시 묻는다 —
 * 로그인 자체가 살아 있어도 그렇다. 30일은 "매번 묻는 성가심"과 "탈취된 기기가
 * 얼마나 오래 열려 있는가" 사이에서 고른 값이다.
 */
export const TWO_FACTOR_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function markSessionVerified(input: {
  sessionId: string;
  userId: string;
  method: SecondFactorMethod;
  userAgent?: string | null;
  ipMasked?: string | null;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + TWO_FACTOR_SESSION_TTL_MS);
  await prisma.twoFactorSession.upsert({
    where: { sessionId: input.sessionId },
    create: {
      sessionId: input.sessionId,
      userId: input.userId,
      method: input.method,
      userAgent: input.userAgent?.slice(0, 300) ?? null,
      ipMasked: input.ipMasked ?? null,
      expiresAt,
    },
    update: { method: input.method, verifiedAt: new Date(), expiresAt },
  });
}

/** 이 세션이 통과했는가. 만료된 기록은 통과로 치지 않는다. */
export async function isSessionVerified(sessionId: string, userId: string): Promise<boolean> {
  if (!sessionId) return false;
  const row = await prisma.twoFactorSession
    .findUnique({
      where: { sessionId },
      select: { userId: true, expiresAt: true },
    })
    .catch(() => null);
  return !!row && row.userId === userId && row.expiresAt > new Date();
}

/**
 * 이 계정의 통과 기록을 전부 지운다 — 다음 요청부터 모든 기기가 다시 묻는다.
 *
 * 2차 인증 수단이 바뀌었을 때(등록·해제·백업 코드 재발급) 반드시 부른다.
 * 수단을 바꿨는데 예전에 통과한 세션이 그대로 열려 있으면, 바꾼 의미가 없다.
 */
export async function revokeVerifiedSessions(userId: string): Promise<void> {
  await prisma.twoFactorSession.deleteMany({ where: { userId } }).catch(() => {});
}

/* ---------- 백업 코드 발급 ---------- */

const BASE32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0/O, 1/I 제외 — 손으로 옮겨 적는 값이다

function makeBackupCode(): string {
  const bytes = new Uint8Array(BACKUP_CODE_BYTES);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += BASE32[b % BASE32.length];
  // 4-4로 끊어 준다 — 옮겨 적을 때 자리를 잃지 않게
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/**
 * 백업 코드 10개를 새로 발급한다. 평문은 이 반환값에만 존재하고 어디에도 남지 않는다.
 *
 * 이전 코드는 전부 지운다 — 재발급의 뜻이 "예전 것을 못 쓰게 한다"이기 때문이다.
 */
export async function issueBackupCodes(userId: string): Promise<string[]> {
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, makeBackupCode);
  const rows = await Promise.all(
    codes.map(async (code) => ({
      userId,
      codeHash: await sha256Hex(code.replace('-', '')),
    })),
  );

  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId } }),
    // createMany 한 번 — 10개를 순차 create 하면 인터랙티브 트랜잭션 시간을 잡아먹는다
    prisma.backupCode.createMany({ data: rows }),
  ]);

  return codes;
}

/* ---------- 보안키(WebAuthn) ---------- */

async function setChallenge(userId: string, challenge: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { webauthnChallenge: challenge, webauthnChallengeAt: new Date() },
  });
}

async function takeChallenge(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { webauthnChallenge: true, webauthnChallengeAt: true },
  });
  if (!user?.webauthnChallenge || !user.webauthnChallengeAt) return null;
  if (Date.now() - user.webauthnChallengeAt.getTime() > CHALLENGE_TTL_MS) return null;
  return user.webauthnChallenge;
}

async function clearChallenge(userId: string): Promise<void> {
  await prisma.user
    .update({ where: { id: userId }, data: { webauthnChallenge: null, webauthnChallengeAt: null } })
    .catch(() => {});
}

/** 보안키 등록 옵션. 이미 등록된 키는 제외해 같은 키가 두 번 들어오지 않게 한다. */
export async function beginKeyRegistration(user: { id: string; email: string }) {
  const existing = await prisma.webauthnKey.findMany({
    where: { userId: user.id },
    select: { credentialId: true },
  });

  const options = await generateRegistrationOptions({
    rpName: 'debateCode',
    rpID: webauthnRpId(),
    userID: new TextEncoder().encode(user.id),
    userName: user.email || user.id,
    timeout: 60_000,
    attestationType: 'none',
    // credentialId를 넘긴다. 예전에는 여기에 **행의 UUID**를 넣고 있어서
    // 중복 등록 방지가 아무 일도 하지 않았다.
    excludeCredentials: existing.map((k) => ({ id: k.credentialId })),
    authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
  });

  await setChallenge(user.id, options.challenge);
  return options;
}

export type RegisterOutcome = { ok: true; keyId: string } | { ok: false; error: string };

export async function completeKeyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  name: string | null,
): Promise<RegisterOutcome> {
  const challenge = await takeChallenge(userId);
  if (!challenge) return { ok: false, error: '등록 시간이 지났습니다. 다시 시도해 주세요.' };

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: webauthnOrigin(),
      expectedRPID: webauthnRpId(),
    });
    if (!verification.verified || !verification.registrationInfo) {
      return { ok: false, error: '보안키를 확인하지 못했습니다.' };
    }

    const { credential } = verification.registrationInfo;
    const created = await prisma.webauthnKey.create({
      data: {
        userId,
        name: name?.slice(0, 40) || null,
        credentialId: credential.id,
        publicKey: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: (credential.transports ?? []) as unknown as object,
      },
      select: { id: true },
    });
    return { ok: true, keyId: created.id };
  } catch (error) {
    // 같은 키를 다시 등록한 경우(credentialId 유니크 충돌)도 여기로 온다
    const message = error instanceof Error && error.message.includes('Unique')
      ? '이미 등록된 보안키입니다.'
      : '보안키 등록에 실패했습니다.';
    return { ok: false, error: message };
  } finally {
    await clearChallenge(userId);
  }
}

/** 보안키 인증 옵션 — 이 계정에 등록된 키만 허용한다. */
export async function beginKeyAssertion(userId: string) {
  const keys = await prisma.webauthnKey.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });
  if (keys.length === 0) return null;

  const options = await generateAuthenticationOptions({
    rpID: webauthnRpId(),
    timeout: 60_000,
    userVerification: 'preferred',
    allowCredentials: keys.map((k) => ({ id: k.credentialId })),
  });

  await setChallenge(userId, options.challenge);
  return options;
}

/**
 * 보안키로 본인 확인.
 *
 * 서명 카운터를 함께 올린다. 인증기가 보고한 카운터가 저장된 값보다 크지 않으면
 * 복제된 키일 수 있다 — 라이브러리가 그 판정을 하고, 우리는 결과를 저장한다.
 */
export async function verifyKeyAssertion(
  userId: string,
  response: AuthenticationResponseJSON,
): Promise<VerifyOutcome> {
  const gated = await gateAttempt(userId, 'webauthn');
  if (!gated.ok) return gated;

  const challenge = await takeChallenge(userId);
  if (!challenge) return { ok: false, error: '확인 시간이 지났습니다. 다시 시도해 주세요.' };

  const key = await prisma.webauthnKey.findFirst({
    where: { userId, credentialId: response.id },
    select: { id: true, credentialId: true, publicKey: true, counter: true },
  });
  if (!key) {
    await clearChallenge(userId);
    return { ok: false, error: '이 계정에 등록된 보안키가 아닙니다.' };
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: webauthnOrigin(),
      expectedRPID: webauthnRpId(),
      credential: {
        id: key.credentialId,
        publicKey: fromBase64Url(key.publicKey),
        counter: key.counter,
      },
      requireUserVerification: false,
    });
    if (!verification.verified) return { ok: false, error: '보안키를 확인하지 못했습니다.' };

    await prisma.webauthnKey.update({
      where: { id: key.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
    return { ok: true };
  } catch {
    return { ok: false, error: '보안키를 확인하지 못했습니다.' };
  } finally {
    await clearChallenge(userId);
  }
}

/* ---------- 되돌릴 수 없는 동작 앞의 확인 ---------- */

export type SecondFactorProof =
  | { method: 'totp'; code: string }
  | { method: 'backup'; code: string }
  | { method: 'recovery_email'; code: string }
  | { method: 'webauthn'; response: AuthenticationResponseJSON };

export type SecondFactorMethod = SecondFactorProof['method'];

/**
 * 2차 인증이 설정된 계정이면 통과해야만 진행한다.
 *
 * 설정하지 않은 계정에는 요구하지 않는다 — 없는 수단을 요구하면 탈퇴 자체가 막힌다.
 */
export async function requireSecondFactor(
  userId: string,
  proof: SecondFactorProof | null,
): Promise<VerifyOutcome & { required?: TwoFactorState }> {
  const state = await getTwoFactorState(userId);
  if (!state.any) return { ok: true };

  if (!proof) {
    return { ok: false, error: '2차 인증 확인이 필요합니다.', required: state };
  }

  if (proof.method === 'totp') {
    if (!state.totp) return { ok: false, error: '인증 앱이 등록되어 있지 않습니다.', required: state };
    const result = await verifyTotpCode(userId, proof.code);
    return result.ok ? result : { ...result, required: state };
  }
  if (proof.method === 'backup') {
    const result = await consumeBackupCode(userId, proof.code);
    return result.ok ? result : { ...result, required: state };
  }
  if (proof.method === 'recovery_email') {
    if (!state.recoveryEmail) {
      return { ok: false, error: '확인된 복구 이메일이 없습니다.', required: state };
    }
    const result = await verifyRecoveryEmailCode(userId, proof.code);
    return result.ok ? result : { ...result, required: state };
  }
  if (!state.securityKeys) {
    return { ok: false, error: '등록된 보안키가 없습니다.', required: state };
  }
  const result = await verifyKeyAssertion(userId, proof.response);
  return result.ok ? result : { ...result, required: state };
}

/* ---------- base64url ---------- */

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 반환 타입을 명시적으로 ArrayBuffer 기반으로 고정한다.
// @simplewebauthn의 WebAuthnCredential.publicKey는 Uint8Array<ArrayBuffer>를 요구하는데,
// 기본 Uint8Array는 ArrayBufferLike(SharedArrayBuffer 포함)라 그대로는 맞지 않는다.
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
