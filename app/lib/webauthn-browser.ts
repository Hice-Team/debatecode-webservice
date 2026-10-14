// WebAuthn 브라우저 쪽 — 등록·인증 의식(ceremony)과 직렬화.
//
// 왜 따로 두는가. 브라우저 API는 ArrayBuffer를 주고받는데 서버(@simplewebauthn)는
// base64url 문자열이 담긴 JSON을 기대한다. 이 변환을 화면 컴포넌트마다 손으로 쓰면
// 반드시 어긋난다 — 실제로 등록 화면이 `rawId`를 **숫자 배열**로 보내고 있어서
// 서버가 읽지 못하는 상태였다. 변환은 여기 한 곳에만 둔다.
//
// (@simplewebauthn/browser를 넣으면 이 파일이 필요 없지만, 의존성 하나를 더 들이는
//  대신 필요한 두 함수만 여기 둔다. 형식은 그 라이브러리가 만드는 것과 같다.)
'use client';

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 반환 타입을 ArrayBuffer 기반으로 고정한다. 브라우저 API의 BufferSource는
// Uint8Array<ArrayBuffer>를 요구하는데, 기본 Uint8Array는 ArrayBufferLike
// (SharedArrayBuffer 포함)라 그대로는 맞지 않는다.
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function isWebAuthnAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

/** 이용자가 창을 닫거나 지문 인식을 취소한 경우 — 오류로 단정하지 않는다. */
export class WebAuthnCancelled extends Error {
  constructor() {
    super('보안키 확인이 취소되었습니다.');
    this.name = 'WebAuthnCancelled';
  }
}

/* ---------- 등록 ---------- */

interface ServerCreateOptions {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  excludeCredentials?: Array<{ id: string; type?: string; transports?: string[] }>;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
}

export async function createCredential(options: ServerCreateOptions) {
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: fromBase64Url(options.challenge),
    rp: options.rp,
    user: {
      id: fromBase64Url(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams,
    timeout: options.timeout,
    attestation: options.attestation,
    authenticatorSelection: options.authenticatorSelection,
    excludeCredentials: options.excludeCredentials?.map((c) => ({
      id: fromBase64Url(c.id),
      type: 'public-key' as const,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new WebAuthnCancelled();

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      attestationObject: toBase64Url(response.attestationObject),
      transports: response.getTransports?.() ?? [],
    },
  };
}

/* ---------- 인증 ---------- */

interface ServerRequestOptions {
  challenge: string;
  rpId?: string;
  timeout?: number;
  userVerification?: UserVerificationRequirement;
  allowCredentials?: Array<{ id: string; type?: string; transports?: string[] }>;
}

export async function getAssertion(options: ServerRequestOptions) {
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: fromBase64Url(options.challenge),
    rpId: options.rpId,
    timeout: options.timeout,
    userVerification: options.userVerification,
    allowCredentials: options.allowCredentials?.map((c) => ({
      id: fromBase64Url(c.id),
      type: 'public-key' as const,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new WebAuthnCancelled();

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
    },
  };
}

/**
 * 보안키로 본인 확인을 한 번 수행하고, 서버에 넘길 응답을 돌려준다.
 * 되돌릴 수 없는 동작(예: 회원 탈퇴) 앞에서 부른다.
 */
export async function assertSecurityKey(endpoint = '/api/settings/webauthn/assert'): Promise<unknown> {
  // 로그인 2차 인증은 다른 입구를 쓴다(/api/auth/2fa/assert). 설정 쪽 라우트는
  // 2차 인증을 이미 통과한 세션만 받으므로, 지금 통과하려는 사람은 쓸 수 없다.
  const res = await fetch(endpoint, { method: 'POST' });
  const options = await res.json();
  if (!res.ok) throw new Error(options?.error ?? '보안키 확인을 시작하지 못했습니다.');
  return getAssertion(options as ServerRequestOptions);
}
