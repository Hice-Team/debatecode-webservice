'use client';

// 회원 탈퇴 — 되돌릴 수 없는 일이라 단계를 둔다.
//   1) 무엇이 사라지는지 읽는다
//   2) 확인 문구를 그대로 입력한다
//   3) 2차 인증을 설정해 둔 계정이면 그 수단으로 한 번 더 확인한다
//
// 3단계를 붙인 이유는 분명하다. 세션이 탈취된 상태에서 계정이 지워지면 되찾을 방법이
// 없고, 그건 2차 인증이 막아야 하는 바로 그 상황이다. 설정하지 않은 계정에는 요구하지
// 않는다 — 없는 수단을 요구하면 탈퇴 자체가 막힌다.
import { useActionState, useState } from 'react';
import { deleteAccount, type DeleteAccountState } from '@/app/lib/actions/account';
import { DELETE_CONFIRM_PHRASE } from '@/app/lib/account-policy';
import { assertSecurityKey, isWebAuthnAvailable, WebAuthnCancelled } from '@/app/lib/webauthn-browser';

const initialState: DeleteAccountState = {};

const LOSES = [
  '작성한 글·답글과 받은 좋아요',
  '문제 풀이 기록·제출 이력·AI 면접 리포트',
  'AI Search 대화와 등록한 API 키',
  '보유 포인트와 디베이트샵 주문 내역',
  '등록한 보안키·인증 앱·백업 코드',
];

export interface DeleteAccountGuard {
  totp: boolean;
  securityKeys: number;
  backupCodesLeft: number;
}

export default function DeleteAccount({ email, guard }: { email: string; guard: DeleteAccountGuard }) {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [assertion, setAssertion] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyPending, setKeyPending] = useState(false);

  // 서버가 최종 판정을 하지만, 화면도 같은 조건을 알고 있어야 버튼을 언제 열지 정할 수 있다.
  const needsSecondFactor = guard.totp || guard.securityKeys > 0;
  const canUseKey = guard.securityKeys > 0 && isWebAuthnAvailable();
  const secondFactorReady = !needsSecondFactor || !!assertion || code.trim().length >= 6;

  const ready = typed.trim() === DELETE_CONFIRM_PHRASE && secondFactorReady;

  /** 보안키로 한 번 확인하고, 그 응답을 폼에 담아 둔다(서버 액션은 FormData만 받는다). */
  async function confirmWithKey() {
    setKeyPending(true);
    setKeyError(null);
    try {
      const result = await assertSecurityKey();
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
      setKeyPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50"
      >
        회원 탈퇴
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
      <p className="text-sm font-semibold text-rose-900">
        <span data-no-translate>{email}</span> 계정을 삭제합니다
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-rose-900/70">
        탈퇴하면 아래 데이터가 즉시 삭제되며 복구할 수 없습니다.
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] leading-relaxed text-rose-900/70">
        {LOSES.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <form action={formAction} className="mt-4">
        <label htmlFor="delete-confirm" className="block text-[13px] font-medium text-rose-900">
          계속하려면 <span className="font-mono font-bold">{DELETE_CONFIRM_PHRASE}</span>을(를) 입력하세요
        </label>
        <input
          id="delete-confirm"
          name="confirm"
          type="text"
          autoComplete="off"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1.5 w-full max-w-xs rounded-lg border border-rose-300 bg-surface px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
        />

        {needsSecondFactor && (
          <div className="mt-4 rounded-lg border border-rose-300/70 bg-surface/70 p-3">
            <p className="text-[13px] font-semibold text-rose-900">2차 인증 확인</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-rose-900/70">
              이 계정에는 2차 인증이 설정되어 있습니다. 삭제는 되돌릴 수 없으므로 본인 확인을 한 번 더 받습니다.
            </p>

            {canUseKey && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={confirmWithKey}
                  disabled={keyPending}
                  className="rounded-lg border border-rose-300 bg-surface px-3 py-1.5 text-[13px] font-medium text-rose-800 disabled:opacity-50"
                >
                  {keyPending ? '확인 중…' : assertion ? '보안키 확인됨 ✓' : '보안키로 확인'}
                </button>
                {guard.totp && <span className="text-[12px] text-rose-900/60">또는 아래에 코드 입력</span>}
              </div>
            )}
            {keyError && <p className="mt-1.5 text-[12px] text-rose-700">{keyError}</p>}

            {(guard.totp || guard.backupCodesLeft > 0) && !assertion && (
              <div className="mt-2.5">
                <label htmlFor="delete-2fa" className="block text-[12px] font-medium text-rose-900">
                  {guard.totp ? '인증 앱 6자리 코드' : '백업 코드'}
                  {guard.backupCodesLeft > 0 && guard.totp && (
                    <span className="ml-1 font-normal text-rose-900/60">(백업 코드도 됩니다)</span>
                  )}
                </label>
                <input
                  id="delete-2fa"
                  name={/^[0-9]{6}$/.test(code.trim()) ? 'totpCode' : 'backupCode'}
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={guard.totp ? '123456' : 'ABCD-EFGH'}
                  className="mt-1 w-full max-w-[14rem] rounded-lg border border-rose-300 bg-surface px-3 py-2 font-mono text-sm tracking-wider focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
                />
              </div>
            )}

            <input type="hidden" name="webauthn" value={assertion} />
          </div>
        )}

        {state.error && <p className="mt-2 text-[13px] text-rose-700">{state.error}</p>}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="submit"
            disabled={!ready || pending}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? '탈퇴 처리 중…' : '영구 삭제'}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setTyped('');
              setCode('');
              setAssertion('');
              setKeyError(null);
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:text-fg"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
