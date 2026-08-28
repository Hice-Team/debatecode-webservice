'use client';

// 이메일 인증 — 6자리 코드로 "이 주소를 실제로 받아볼 수 있는가"를 확인한다.
//
// 가입 마무리 화면에도 같은 카드가 있지만 그 화면은 한 번만 지나간다. 정작 인증이
// 필요해지는 순간(중고 거래를 하려 할 때, 비밀번호를 잊었을 때)은 한참 뒤라서,
// 그때 찾아올 자리가 설정에도 있어야 한다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmVerificationEmail, sendVerificationEmail } from '@/app/lib/actions/signup-extras';

export default function EmailVerification({
  email,
  verifiedAt,
}: {
  email: string;
  verifiedAt: string | null;
}) {
  const router = useRouter();
  const [verified, setVerified] = useState(!!verifiedAt);
  const [state, setState] = useState<{ ok?: string; error?: string; sent?: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setState(null);
    try {
      const result = await sendVerificationEmail();
      setState(result);
      if (result.ok && !result.sent) setVerified(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const form = new FormData();
      form.set('code', code);
      const result = await confirmVerificationEmail({}, form);
      setState(result);
      if (result.ok && !result.error) {
        setVerified(true);
        setCode('');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">이메일 인증</h4>
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
            verified
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-hairline bg-paper/60 text-fg-muted'
          }`}
        >
          {verified ? '인증됨' : '미인증'}
        </span>
      </div>

      <p className="mt-1 text-sm text-fg-secondary">
        <span data-no-translate className="font-mono text-[13px]">
          {email}
        </span>
        {verified ? (
          verifiedAt ? (
            <span className="ml-2 text-fg-muted">
              · {new Date(verifiedAt).toLocaleDateString('ko-KR')} 확인
            </span>
          ) : null
        ) : (
          <span className="ml-2 text-fg-muted">· 중고 거래와 일부 게시판 답변에 필요합니다</span>
        )}
      </p>

      {!verified && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="rounded-full border border-hairline px-4 py-2 text-[13px] font-medium text-fg-secondary transition-colors hover:border-ink/25 disabled:opacity-40"
          >
            {busy && !state?.sent ? '보내는 중…' : state?.sent ? '코드 다시 보내기' : '인증 코드 보내기'}
          </button>

          {state?.sent && (
            <>
              <label htmlFor="settings-verify-code" className="sr-only">
                인증 코드 6자리
              </label>
              <input
                id="settings-verify-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="w-32 rounded-[var(--radius-card)] border border-hairline px-3 py-2 text-center font-mono text-[15px] tracking-[0.3em]"
              />
              <button
                type="button"
                onClick={confirm}
                disabled={busy || code.length !== 6}
                className="rounded-full bg-signal px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {busy ? '확인 중…' : '확인'}
              </button>
            </>
          )}
        </div>
      )}

      {state?.ok && !state.error && <p className="mt-2 text-[12px] text-emerald-700">{state.ok}</p>}
      {state?.error && (
        <p role="alert" className="mt-2 text-[12px] text-rose-600">
          {state.error}
        </p>
      )}
    </div>
  );
}
