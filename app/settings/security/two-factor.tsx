'use client';

import { useState } from 'react';
import RecoveryEmail from './recovery-email';

export default function TwoFactor({
  initialEmail,
  recoveryVerifiedAt,
}: {
  initialEmail?: string | null;
  /** 복구 이메일을 코드로 확인한 시각 — 없으면 '미확인'으로 표시한다 */
  recoveryVerifiedAt?: string | null;
}) {
  const [provisioning, setProvisioning] = useState(false);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifyPending, setVerifyPending] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  async function beginSetup() {
    setProvisioning(true);
    setOtpauth(null);
    try {
      const res = await fetch('/api/settings/totp/begin', { method: 'POST' });
      const json = await res.json();
      if (json.otpauth) setOtpauth(json.otpauth);
    } catch (e) {
      // ignore
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
        setOtpauth(null);
        setCode('');
      } else {
        setVerifyError(json.error || '인증 실패');
      }
    } catch (e) {
      setVerifyError('서버 요청 실패');
    } finally {
      setVerifyPending(false);
    }
  }

  async function beginWebAuthn() {
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

      const publicKey: any = { ...opts };
      publicKey.challenge = base64urlToBuffer(opts.challenge);
      publicKey.user.id = base64urlToBuffer(opts.user.id);
      if (publicKey.excludeCredentials) {
        publicKey.excludeCredentials = publicKey.excludeCredentials.map((c: any) => ({ ...c, id: base64urlToBuffer(c.id) }));
      }

      const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
      if (!credential) return alert('브라우저가 자격증명을 생성하지 못했습니다.');

      const clientDataJSON = (credential.response as any).clientDataJSON && Array.from(new Uint8Array((credential.response as any).clientDataJSON));
      const attestationObject = (credential.response as any).attestationObject && Array.from(new Uint8Array((credential.response as any).attestationObject));

      const body = {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
        response: { clientDataJSON, attestationObject },
        name: prompt('이 보안키에 붙일 이름을 입력하세요 (예: 개인 노트북 키)') || null,
      };

      const res2 = await fetch('/api/settings/webauthn/register/complete', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      const json = await res2.json();
      if (json.ok) alert('보안키가 등록되었습니다.');
      else alert('등록 실패: ' + (json.error || '알 수 없음'));
    } catch (e) {
      alert('WebAuthn 등록 중 오류가 발생했습니다.');
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
    } catch (e) {
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
        <h4 className="font-semibold">Google Authenticator (TOTP)</h4>
        <p className="mt-1 text-sm text-ink-soft/60">앱에서 QR 코드를 스캔하고 생성된 코드를 입력하면 2단계 인증이 활성화됩니다.</p>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={beginSetup} disabled={provisioning} className="px-3 py-2 rounded bg-brand-600 text-white">{provisioning ? '생성 중…' : '설정 시작'}</button>
          <span className="text-sm text-ink-soft/60">이미 등록된 경우 새로 발급하면 이전 앱의 등록은 무효화됩니다.</span>
        </div>

        {otpauth && (
          <div className="mt-4 flex items-start gap-4">
            <img src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(otpauth)}&size=200x200`} alt="QR" />
            <div className="flex-1">
              <p className="font-mono text-xs text-ink-soft/60">스캔 후 생성된 6자리 코드를 입력하세요.</p>
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
          <button onClick={disableTwoFactor} className="px-3 py-2 rounded bg-rose-50 text-rose-700 border border-rose-100">2단계 인증 해제</button>
        </div>
      </div>
    </div>
  );
}
