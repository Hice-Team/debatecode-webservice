'use client';

// 2차 인증 확인 — 수단이 여럿이라 "무엇으로 들어갈지" 고르는 화면이기도 하다.
//
// 순서를 정한 기준: 평소에 가장 빠른 것(보안키 → 인증 앱)을 위에 두고,
// 그것을 못 쓰게 됐을 때의 길(복구 이메일 → 복구 키)을 아래에 둔다.
// 2차 인증에서 가장 흔한 사고는 공격자가 뚫는 것이 아니라 **본인이 잠기는 것**이라,
// 대체 수단을 접어 두지 않고 처음부터 보이게 한다.
import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  sendLoginRecoveryCode,
  verifyLoginSecondFactor,
  type LoginTwoFactorState,
} from '@/app/lib/actions/login-two-factor';
import { logout } from '@/app/lib/actions/auth';
import { assertSecurityKey, isWebAuthnAvailable, WebAuthnCancelled } from '@/app/lib/webauthn-browser';

type Method = 'webauthn' | 'totp' | 'recovery_email' | 'backup';

const initial: LoginTwoFactorState = {};

const LABELS: Record<Method, { title: string; hint: string }> = {
  webauthn: { title: '보안키', hint: '지문·얼굴 인식 또는 하드웨어 키' },
  totp: { title: '인증 앱', hint: 'Google Authenticator 등에 표시된 6자리' },
  recovery_email: { title: '복구 이메일', hint: '등록한 주소로 코드를 받습니다' },
  backup: { title: '복구 키', hint: '발급받아 옮겨 적어 둔 코드' },
};

export default function VerifyForm({
  next,
  email,
  options,
}: {
  next: string;
  email: string;
  options: {
    totp: boolean;
    securityKeys: number;
    backupCodesLeft: number;
    recoveryEmailMasked: string | null;
  };
}) {
  const available: Method[] = [
    ...(options.securityKeys > 0 && isWebAuthnAvailable() ? (['webauthn'] as const) : []),
    ...(options.totp ? (['totp'] as const) : []),
    ...(options.recoveryEmailMasked ? (['recovery_email'] as const) : []),
    ...(options.backupCodesLeft > 0 ? (['backup'] as const) : []),
  ];

  const [method, setMethod] = useState<Method>(available[0] ?? 'totp');
  const [code, setCode] = useState('');
  const [assertion, setAssertion] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  const [state, formAction, pending] = useActionState(verifyLoginSecondFactor, initial);
  const [sendState, sendAction, sending] = useActionState(sendLoginRecoveryCode, initial);

  /**
   * 수단을 바꾼다 — 입력값도 함께 비운다.
   *
   * 인증 앱 코드가 복구 키 칸에 남아 있으면 이용자는 그것이 맞는 값인 줄 안다.
   * (effect로 비우면 렌더 뒤에 한 번 더 그려져 값이 잠깐 남는다. 바꾸는 그 자리에서 비운다.)
   */
  function chooseMethod(nextMethod: Method) {
    if (nextMethod === method) return;
    setMethod(nextMethod);
    setCode('');
    setAssertion('');
    setKeyError(null);
  }

  async function runSecurityKey() {
    setKeyBusy(true);
    setKeyError(null);
    try {
      const result = await assertSecurityKey('/api/auth/2fa/assert');
      setAssertion(JSON.stringify(result));
    } catch (error) {
      setAssertion('');
      setKeyError(
        error instanceof WebAuthnCancelled
          ? '보안키 확인이 취소되었습니다.'
          : error instanceof Error
            ? error.message
            : '보안키를 확인하지 못했습니다.',
      );
    } finally {
      setKeyBusy(false);
    }
  }

  const codeReady = method === 'webauthn' ? !!assertion : code.trim().length >= 6;

  return (
    <div className="w-full max-w-md">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-signal">
        Two-Factor
      </p>
      <h1
        className="mt-2 text-2xl font-bold tracking-tight text-fg"
        style={{ fontFamily: 'var(--font-space-grotesk)' }}
      >
        본인 확인이 한 번 더 필요합니다
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-fg-secondary">
        <span data-no-translate className="font-mono text-[13px]">
          {email}
        </span>
        {' 계정에 2차 인증이 켜져 있습니다.'}
      </p>

      {available.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-panel)] border border-rose-200 bg-rose-50/70 p-4">
          <p className="text-sm font-semibold text-rose-900">쓸 수 있는 확인 수단이 없습니다</p>
          <p className="mt-1 text-[13px] leading-relaxed text-rose-900/75">
            등록된 수단을 모두 잃으셨거나 이 브라우저가 보안키를 지원하지 않습니다.
            계정을 되찾으려면 문의해 주세요.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/legal/terms"
              className="rounded-full border border-rose-300 px-3 py-1.5 text-[13px] text-rose-800"
            >
              문의하기
            </Link>
            <form action={logout}>
              <button className="rounded-full px-3 py-1.5 text-[13px] text-rose-800/70">로그아웃</button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* 수단 고르기 — 하나뿐이면 고를 것이 없으므로 감춘다 */}
          {available.length > 1 && (
            <div className="mt-5 grid gap-1.5" role="radiogroup" aria-label="확인 수단">
              {available.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={method === m}
                  onClick={() => chooseMethod(m)}
                  className={`flex items-baseline gap-2 rounded-[var(--radius-card)] border px-3 py-2.5 text-left transition-colors ${
                    method === m
                      ? 'border-signal bg-brand-50/70'
                      : 'border-hairline bg-white hover:border-ink/25'
                  }`}
                >
                  <span className="text-sm font-semibold text-fg">{LABELS[m].title}</span>
                  <span className="text-[12px] text-fg-muted">
                    {m === 'recovery_email' ? options.recoveryEmailMasked : LABELS[m].hint}
                  </span>
                </button>
              ))}
            </div>
          )}

          <form action={formAction} className="mt-5">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="method" value={method} />
            <input type="hidden" name="assertion" value={assertion} />

            {method === 'webauthn' ? (
              <>
                <button
                  type="button"
                  onClick={runSecurityKey}
                  disabled={keyBusy}
                  className="w-full rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-sm font-medium text-fg-secondary transition-colors hover:border-ink/25 disabled:opacity-50"
                >
                  {keyBusy ? '확인 중…' : assertion ? '보안키 확인됨 ✓' : '보안키로 확인하기'}
                </button>
                {keyError && (
                  <p role="alert" className="mt-2 text-[13px] text-rose-600">
                    {keyError}
                  </p>
                )}
              </>
            ) : (
              <>
                <label htmlFor="verify-code" className="block text-[13px] font-medium text-fg">
                  {method === 'backup' ? '복구 키' : '6자리 코드'}
                </label>
                <input
                  id="verify-code"
                  name="code"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      method === 'backup'
                        ? e.target.value.toUpperCase().slice(0, 12)
                        : e.target.value.replace(/[^0-9]/g, '').slice(0, 6),
                    )
                  }
                  inputMode={method === 'backup' ? 'text' : 'numeric'}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder={method === 'backup' ? 'ABCD-EFGH' : '123456'}
                  className="mt-1.5 w-full rounded-[var(--radius-card)] border border-hairline bg-white px-4 py-3 text-center font-mono text-lg tracking-[0.3em] focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/25"
                />

                {method === 'recovery_email' && (
                  <div className="mt-2">
                    <button
                      type="submit"
                      formAction={sendAction}
                      disabled={sending}
                      className="text-[13px] font-medium text-signal underline underline-offset-2 disabled:opacity-50"
                    >
                      {sending ? '보내는 중…' : sendState.notice ? '코드 다시 보내기' : '코드 보내기'}
                    </button>
                    {sendState.notice && (
                      <p className="mt-1.5 text-[12px] text-emerald-700">{sendState.notice}</p>
                    )}
                    {sendState.devCode && (
                      <p className="mt-1 font-mono text-[12px] text-amber-700">
                        개발용 코드: {sendState.devCode}
                      </p>
                    )}
                    {sendState.error && (
                      <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
                        {sendState.error}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {state.error && (
              <p role="alert" className="mt-3 text-[13px] text-rose-600">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || !codeReady}
              className="mt-5 w-full rounded-full bg-signal px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? '확인 중…' : '확인하고 계속'}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-between text-[12px] text-fg-muted">
            <span>이 확인은 30일 동안 이 기기에서 유지됩니다.</span>
            <form action={logout}>
              <button className="underline underline-offset-2 hover:text-fg-secondary">로그아웃</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
