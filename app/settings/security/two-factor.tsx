'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RecoveryEmail from './recovery-email';
import { deleteWebauthnKey } from '@/app/lib/actions/webauthn';

/**
 * /api/settings/webauthn/register/begin이 내려주는 등록 옵션.
 * 브라우저 타입(PublicKeyCredentialCreationOptions)과 달리 버퍼 자리가 base64url 문자열이다.
 */
type WebAuthnCreateOptions = Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'user' | 'excludeCredentials'
> & {
  challenge: string;
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string };
  excludeCredentials?: Array<Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }>;
};

export interface WebauthnKeySummary {
  id: string;
  name: string | null;
  createdAt: string;
}

export default function TwoFactor({
  initialEmail,
  recoveryVerifiedAt,
  initialEnabled = false,
  keys = [],
}: {
  initialEmail?: string | null;
  /** 복구 이메일을 코드로 확인한 시각 — 없으면 '미확인'으로 표시한다 */
  recoveryVerifiedAt?: string | null;
  /** TOTP가 이미 켜져 있는지 — 서버가 알려 주지 않으면 화면이 항상 '꺼짐'으로 보인다 */
  initialEnabled?: boolean;
  /** 등록된 보안키 목록 */
  keys?: WebauthnKeySummary[];
}) {
  const router = useRouter();
  const [provisioning, setProvisioning] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [registering, setRegistering] = useState(false);

  async function beginSetup() {
    setProvisioning(true);
    setQrDataUrl(null);
    try {
      const res = await fetch('/api/settings/totp/begin', { method: 'POST' });
      const json = await res.json();
      if (json.qrDataUrl) {
        setQrDataUrl(json.qrDataUrl);
        setSecret(json.secret ?? null);
      }
    } catch {
      // 실패해도 화면은 그대로 둔다 — 아래 '설정 시작'을 다시 누르면 된다
    } finally {
      setProvisioning(false);
    }
  }

  async function verify() {
    setVerifyPending(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/settings/totp/verify', { method: 'POST', body: JSON.stringify({ code }), headers: { 'Content-Type': 'application/json' } });
      const json = await res.json();
      if (json.ok) {
        setEnabled(true);
        setQrDataUrl(null);
        setSecret(null);
        setCode('');
      } else {
        setVerifyError(json.error || '인증 실패');
      }
    } catch {
      setVerifyError('서버 요청 실패');
    } finally {
      setVerifyPending(false);
    }
  }

  async function beginWebAuthn() {
    if (!window.PublicKeyCredential) {
      alert('이 브라우저는 보안키(WebAuthn)를 지원하지 않습니다.');
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/settings/webauthn/register/begin', { method: 'POST' });
      const opts = await res.json();
      if (!opts) return alert('등록 옵션을 가져오지 못했습니다.');

      // convert challenge and user.id to ArrayBuffers if needed by browser
      function base64urlToBuffer(base64url: string) {
        const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
        const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(base64);
        const buffer = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; ++i) buffer[i] = raw.charCodeAt(i);
        return buffer;
      }

      // 서버는 JSON만 보낼 수 있어 challenge·user.id·excludeCredentials를 base64url 문자열로
      // 내려보낸다. 브라우저 API는 ArrayBuffer만 받으므로 여기서 되돌린다.
      const { challenge, user, excludeCredentials, ...rest } = opts as WebAuthnCreateOptions;
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...rest,
        challenge: base64urlToBuffer(challenge),
        user: { ...user, id: base64urlToBuffer(user.id) },
        ...(excludeCredentials
          ? { excludeCredentials: excludeCredentials.map((c) => ({ ...c, id: base64urlToBuffer(c.id) })) }
          : {}),
      };

      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
      if (!credential) return alert('브라우저가 자격증명을 생성하지 못했습니다.');

      const response = credential.response as AuthenticatorAttestationResponse;
      const clientDataJSON = Array.from(new Uint8Array(response.clientDataJSON));
      const attestationObject = Array.from(new Uint8Array(response.attestationObject));

      const body = {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
        response: { clientDataJSON, attestationObject },
        name: prompt('이 보안키에 붙일 이름을 입력하세요 (예: 개인 노트북 키)') || null,
      };

      const res2 = await fetch('/api/settings/webauthn/register/complete', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      const json = await res2.json();
      if (json.ok) {
        alert('보안키가 등록되었습니다.');
        // 목록은 서버 컴포넌트가 그린다 — 새로 읽어 와야 방금 등록한 키가 보인다
        router.refresh();
      } else {
        alert('등록 실패: ' + (json.error || '알 수 없음'));
      }
    } catch {
      // 이용자가 창을 닫거나 지문 인식을 취소해도 여기로 온다 — 오류로 단정하지 않는다
      alert('보안키 등록이 완료되지 않았습니다. 다시 시도해 주세요.');
    } finally {
      setRegistering(false);
    }
  }

  async function generateBackup() {
    try {
      const res = await fetch('/api/settings/backup/generate', { method: 'POST' });
      const json = await res.json();
      if (json.ok && Array.isArray(json.codes)) {
        // show codes in alert/modal — simple approach
        alert('백업 코드(한 번만 표시됩니다):\n' + json.codes.join('\n'));
      } else {
        alert('백업 코드 생성에 실패했습니다.');
      }
    } catch {
      alert('서버 요청 실패');
    }
  }

  async function disableTwoFactor() {
    if (!confirm('2단계 인증을 비활성화하시겠습니까?')) return;
    try {
      const res = await fetch('/api/settings/totp/disable', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setEnabled(false);
        alert('2단계 인증이 비활성화되었습니다.');
      } else {
        alert('비활성화 실패');
      }
    } catch {
      alert('서버 요청 실패');
    }
  }

  return (
    <div className="space-y-4">
      {/* 복구 이메일 — 코드 확인을 거쳐야 저장된다(app/settings/security/recovery-email.tsx) */}
      <RecoveryEmail current={initialEmail ?? null} verifiedAt={recoveryVerifiedAt ?? null} />

      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">인증 앱 (TOTP)</h4>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              enabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-ink/10 bg-paper/60 text-ink-soft/50'
            }`}
          >
            {enabled ? '사용 중' : '꺼짐'}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft/60">앱에서 QR 코드를 스캔하고 생성된 코드를 입력하면 2단계 인증이 활성화됩니다.</p>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={beginSetup} disabled={provisioning} className="px-3 py-2 rounded bg-brand-600 text-white">{provisioning ? '생성 중…' : '설정 시작'}</button>
          <span className="text-sm text-ink-soft/60">이미 등록된 경우 새로 발급하면 이전 앱의 등록은 무효화됩니다.</span>
        </div>

        {qrDataUrl && (
          <div className="mt-4 flex flex-wrap items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL이라 최적화 대상이 아니다 */}
            <img src={qrDataUrl} alt="TOTP 등록용 QR 코드" width={200} height={200} className="rounded-lg border border-ink/10" />
            <div className="min-w-[16rem] flex-1">
              <p className="font-mono text-xs text-ink-soft/60">스캔 후 생성된 6자리 코드를 입력하세요.</p>
              {secret && (
                <p className="mt-1.5 break-all rounded bg-paper/60 px-2 py-1 font-mono text-[10px] text-ink-soft/55">
                  QR을 못 찍는다면 이 키를 앱에 직접 입력: {secret}
                </p>
              )}
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="mt-2 w-full rounded-lg border px-3 py-2" />
              <div className="mt-3 flex items-center gap-3">
                <button onClick={verify} disabled={verifyPending} className="px-3 py-2 rounded bg-emerald-600 text-white">{verifyPending ? '확인 중…' : '확인 및 활성화'}</button>
                {verifyError && <p className="text-sm text-rose-600">{verifyError}</p>}
              </div>
            </div>
          </div>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button onClick={generateBackup} className="px-3 py-2 rounded bg-ink/10">백업 코드 생성</button>
          {enabled && (
            <button
              onClick={disableTwoFactor}
              className="px-3 py-2 rounded bg-rose-50 text-rose-700 border border-rose-100"
            >
              2단계 인증 해제
            </button>
          )}
        </div>
      </div>

      {/* 보안키 — 등록 함수는 있는데 부르는 버튼이 없어서 그동안 쓸 수 없었다 */}
      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">보안키 (WebAuthn)</h4>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              keys.length > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-ink/10 bg-paper/60 text-ink-soft/50'
            }`}
          >
            {keys.length > 0 ? `${keys.length}개 등록됨` : '없음'}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft/60">
          지문·얼굴 인식이나 하드웨어 키(YubiKey 등)로 로그인합니다. 코드를 옮겨 적을 필요가 없고, 피싱 사이트에서는
          아예 동작하지 않습니다.
        </p>

        {keys.length > 0 && (
          <ul className="mt-3 divide-y divide-ink/5 rounded-lg border border-ink/10">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{key.name || '이름 없는 키'}</span>
                <span className="font-mono text-[10px] text-ink-soft/40">
                  {new Date(key.createdAt).toLocaleDateString('ko-KR')}
                </span>
                <form action={deleteWebauthnKey}>
                  <input type="hidden" name="id" value={key.id} />
                  <button className="rounded border border-ink/15 px-2 py-1 text-xs text-ink-soft/70 hover:border-rose-300 hover:text-rose-700">
                    삭제
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3">
          <button
            onClick={beginWebAuthn}
            disabled={registering}
            className="rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {registering ? '등록 중…' : keys.length > 0 ? '보안키 추가' : '보안키 등록'}
          </button>
        </div>
      </div>
    </div>
  );
}
