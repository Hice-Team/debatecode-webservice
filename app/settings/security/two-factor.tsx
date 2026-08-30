'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import RecoveryEmail from './recovery-email';
import { deleteWebauthnKey } from '@/app/lib/actions/webauthn';
import {
  assertSecurityKey,
  createCredential,
  isWebAuthnAvailable,
  WebAuthnCancelled,
} from '@/app/lib/webauthn-browser';

export interface WebauthnKeySummary {
  id: string;
  name: string | null;
  createdAt: string;
}

/**
 * 백업 코드를 텍스트 파일로 저장한다.
 *
 * "옮겨 적으세요"만 두면 대부분 화면을 캡처하는데, 그 이미지는 잠기지 않은 사진첩에
 * 남는다. 파일로 내려 주면 최소한 어디에 두었는지 아는 상태가 된다.
 * 서버를 거치지 않는다 — 코드는 이미 브라우저에 있고, 다시 보내면 경로만 하나 늘어난다.
 */
function downloadBackupCodes(codes: string[]) {
  const nl = String.fromCharCode(10);
  const body = [
    'debateCode 백업 코드',
    '발급 ' + new Date().toLocaleString('ko-KR'),
    '',
    '· 인증 앱을 쓸 수 없을 때 6자리 코드 대신 입력합니다.',
    '· 코드 하나는 한 번만 쓸 수 있습니다.',
    '· 다시 발급하면 아래 코드는 모두 무효가 됩니다.',
    '',
    ...codes,
    '',
  ].join(nl);
  const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'debatecode-backup-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
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
  const [keyName, setKeyName] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [backupPending, setBackupPending] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);

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
    if (!isWebAuthnAvailable()) {
      setKeyError('이 브라우저는 보안키(WebAuthn)를 지원하지 않습니다.');
      return;
    }
    setRegistering(true);
    setKeyError(null);
    try {
      const res = await fetch('/api/settings/webauthn/register/begin', { method: 'POST' });
      const options = await res.json();
      if (!res.ok) throw new Error(options?.error ?? '등록 옵션을 가져오지 못했습니다.');

      // 버퍼 ↔ base64url 변환은 app/lib/webauthn-browser.ts 한 곳에만 있다.
      // 예전에는 여기서 rawId를 숫자 배열로 만들어 보냈는데, 서버가 기대하는 형식은
      // base64url 문자열이라 등록이 조용히 실패하고 있었다.
      const attestation = await createCredential(options);

      const complete = await fetch('/api/settings/webauthn/register/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation, name: keyName.trim() || null }),
      });
      const json = await complete.json();
      if (!json.ok) throw new Error(json.error ?? '등록에 실패했습니다.');

      setKeyName('');
      // 목록은 서버 컴포넌트가 그린다 — 새로 읽어 와야 방금 등록한 키가 보인다
      router.refresh();
    } catch (error) {
      setKeyError(
        error instanceof WebAuthnCancelled
          ? '보안키 등록이 취소되었습니다.'
          : error instanceof Error
            ? error.message
            : '보안키 등록에 실패했습니다.',
      );
    } finally {
      setRegistering(false);
    }
  }

  /**
   * 백업 코드 발급.
   *
   * alert()로 띄우던 것을 화면 안으로 옮겼다. 다시 볼 수 없는 값인데 alert은
   * 실수로 닫기 쉽고, 복사할 수도 없고, 모바일에서는 잘려 보인다.
   */
  async function generateBackup() {
    setBackupPending(true);
    setBackupError(null);
    try {
      const res = await fetch('/api/settings/backup/generate', { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.codes)) {
        throw new Error(json?.error ?? '백업 코드를 만들지 못했습니다.');
      }
      setBackupCodes(json.codes);
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : '백업 코드를 만들지 못했습니다.');
    } finally {
      setBackupPending(false);
    }
  }

  /**
   * 2단계 인증 해제 — 지금 켜져 있는 수단으로 한 번 확인한다.
   *
   * 세션만 있으면 끌 수 있다면, 세션을 훔친 사람이 가장 먼저 하는 일이 그것이 된다.
   */
  async function disableTwoFactor() {
    const entered = window.prompt(
      '해제하려면 인증 앱에 표시된 6자리 코드를 입력해 주세요. (앱을 쓸 수 없으면 백업 코드도 됩니다.)',
    );
    if (!entered) return;

    const trimmed = entered.trim();
    const proof = /^[0-9]{6}$/.test(trimmed)
      ? { method: 'totp' as const, code: trimmed }
      : { method: 'backup' as const, code: trimmed };

    try {
      const res = await fetch('/api/settings/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof }),
      });
      const json = await res.json();
      if (json.ok) {
        setEnabled(false);
        setBackupCodes(null);
        router.refresh();
      } else {
        setVerifyError(json.error ?? '해제하지 못했습니다.');
      }
    } catch {
      setVerifyError('서버 요청에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      {/* 복구 이메일 — 코드 확인을 거쳐야 저장된다(app/settings/security/recovery-email.tsx) */}
      <RecoveryEmail current={initialEmail ?? null} verifiedAt={recoveryVerifiedAt ?? null} />

      <div className="rounded-xl border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">인증 앱 (TOTP)</h4>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              enabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-hairline bg-paper/60 text-fg-muted'
            }`}
          >
            {enabled ? '사용 중' : '꺼짐'}
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-secondary">
          앱에서 QR 코드를 스캔하고 생성된 코드를 입력하면 등록됩니다. Google Authenticator·1Password 등
          표준 TOTP 앱을 모두 지원합니다.
        </p>
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[12px] leading-relaxed text-emerald-900">
          켜면 <strong>다음 로그인부터</strong> 비밀번호 뒤에 확인을 한 번 더 받습니다. 계정 삭제처럼
          되돌릴 수 없는 동작에도 같은 확인이 붙습니다. 확인은 기기별로 30일 동안 유지됩니다.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={beginSetup} disabled={provisioning} className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] bg-signal px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40">{provisioning ? '생성 중…' : '설정 시작'}</button>
          <span className="text-sm text-fg-secondary">이미 등록된 경우 새로 발급하면 이전 앱의 등록은 무효화됩니다.</span>
        </div>

        {qrDataUrl && (
          <div className="mt-4 flex flex-wrap items-start gap-4">
            { }
            <img src={qrDataUrl} alt="TOTP 등록용 QR 코드" width={200} height={200} className="rounded-lg border border-hairline" />
            <div className="min-w-[16rem] flex-1">
              <p className="font-mono text-xs text-fg-secondary">스캔 후 생성된 6자리 코드를 입력하세요.</p>
              {secret && (
                <p className="mt-1.5 break-all rounded bg-paper/60 px-2 py-1 font-mono text-[10px] text-fg-muted">
                  QR을 못 찍는다면 이 키를 앱에 직접 입력: {secret}
                </p>
              )}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                aria-label="인증 앱에 표시된 6자리 코드"
                className="mt-2 w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 font-mono text-sm tracking-[0.2em] text-fg focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
              />
              <div className="mt-3 flex items-center gap-3">
                <button onClick={verify} disabled={verifyPending} className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] bg-signal px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40">{verifyPending ? '확인 중…' : '확인 및 활성화'}</button>
                {verifyError && <p className="text-sm text-rose-600">{verifyError}</p>}
              </div>
            </div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={generateBackup}
            disabled={backupPending}
            className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg disabled:opacity-40"
          >
            {backupPending ? '만드는 중…' : backupCodes ? '백업 코드 다시 발급' : '백업 코드 발급'}
          </button>
          {enabled && (
            <button
              onClick={disableTwoFactor}
              className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 px-4 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100"
            >
              2단계 인증 해제
            </button>
          )}
          {backupError && <p className="text-sm text-rose-600">{backupError}</p>}
        </div>

        {backupCodes && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-[12px] font-semibold text-amber-900">
              지금 옮겨 적어 주세요 — 이 코드는 다시 볼 수 없습니다.
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-900/75">
              인증 앱을 쓸 수 없을 때 대신 입력합니다. 코드 하나는 한 번만 쓸 수 있고, 다시 발급하면
              여기 있는 코드는 모두 무효가 됩니다.
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {backupCodes.map((c) => (
                <li key={c} className="rounded bg-surface/70 px-2 py-1 text-center font-mono text-[12px] tracking-wider">
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => navigator.clipboard?.writeText(backupCodes.join(String.fromCharCode(10)))}
                className="dc-tap rounded-[var(--radius-control)] border border-amber-300 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                모두 복사
              </button>
              <button
                onClick={() => downloadBackupCodes(backupCodes)}
                className="dc-tap rounded-[var(--radius-control)] border border-amber-300 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                파일로 저장
              </button>
              <button
                onClick={() => setBackupCodes(null)}
                className="dc-tap rounded-[var(--radius-control)] border border-amber-300 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
              >
                옮겨 적었습니다 — 닫기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 보안키 — 등록 함수는 있는데 부르는 버튼이 없어서 그동안 쓸 수 없었다 */}
      <div className="rounded-xl border border-hairline bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">보안키 (WebAuthn)</h4>
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
              keys.length > 0
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-hairline bg-paper/60 text-fg-muted'
            }`}
          >
            {keys.length > 0 ? `${keys.length}개 등록됨` : '없음'}
          </span>
        </div>
        <p className="mt-1 text-sm text-fg-secondary">
          지문·얼굴 인식이나 하드웨어 키(YubiKey 등)로 로그인합니다. 코드를 옮겨 적을 필요가 없고, 피싱 사이트에서는
          아예 동작하지 않습니다.
        </p>

        {keys.length > 0 && (
          <ul className="mt-3 divide-y divide-hairline rounded-lg border border-hairline">
            {keys.map((key) => (
              <KeyRow
                key={key.id}
                item={key}
                // 이 키를 지우면 계정에 2차 인증이 하나도 남지 않는 경우
                isLastFactor={keys.length === 1 && !enabled}
              />
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* 이름은 prompt() 대신 입력란으로 받는다 — prompt는 붙여넣기가 어렵고
              브라우저가 막아 두는 경우도 있다 */}
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="키 이름 (예: 개인 노트북)"
            maxLength={40}
            className="min-w-0 flex-1 rounded-lg border border-hairline px-3 py-2 text-sm"
          />
          <button
            onClick={beginWebAuthn}
            disabled={registering}
            className="rounded bg-brand-600 px-3 py-2 text-white disabled:opacity-50"
          >
            {registering ? '등록 중…' : keys.length > 0 ? '보안키 추가' : '보안키 등록'}
          </button>
        </div>
        {keyError && <p className="mt-2 text-sm text-rose-600">{keyError}</p>}
      </div>
    </div>
  );
}

/**
 * 등록된 보안키 한 줄.
 *
 * 마지막 남은 2차 인증 수단을 지울 때는 그 키로 한 번 확인한다. 서버도 같은 조건을
 * 검사하지만(app/lib/actions/webauthn.ts), 화면이 모르면 이용자는 "삭제를 눌렀는데
 * 아무 일도 일어나지 않는" 상태를 본다 — 조용히 실패하는 화면이 가장 나쁘다.
 */
function KeyRow({ item, isLastFactor }: { item: WebauthnKeySummary; isLastFactor: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [assertion, setAssertion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.MouseEvent<HTMLButtonElement>) {
    if (!isLastFactor) return; // 그대로 제출된다

    e.preventDefault();
    setError(null);
    if (!window.confirm('이 키를 지우면 이 계정의 2차 인증이 모두 사라집니다. 계속할까요?')) return;

    setBusy(true);
    try {
      const result = await assertSecurityKey();
      setAssertion(JSON.stringify(result));
      // 상태 반영 후 제출 — hidden 필드가 채워진 뒤여야 한다
      queueMicrotask(() => formRef.current?.requestSubmit());
    } catch (err) {
      setError(
        err instanceof WebAuthnCancelled
          ? '확인이 취소되었습니다.'
          : err instanceof Error
            ? err.message
            : '보안키를 확인하지 못했습니다.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{item.name || '이름 없는 키'}</span>
      <span className="font-mono text-[10px] text-fg-quiet">
        {new Date(item.createdAt).toLocaleDateString('ko-KR')}
      </span>
      <form ref={formRef} action={deleteWebauthnKey}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="webauthn" value={assertion} />
        <button
          onClick={handleDelete}
          disabled={busy}
          className="rounded border border-hairline px-2 py-1 text-xs text-fg-secondary hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
        >
          {busy ? '확인 중…' : '삭제'}
        </button>
      </form>
      {error && <p className="w-full text-xs text-rose-600">{error}</p>}
    </li>
  );
}
