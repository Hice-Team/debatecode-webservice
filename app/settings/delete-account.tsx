'use client';

// 회원 탈퇴 — 되돌릴 수 없는 일이라 두 단계를 둔다.
//   1) 무엇이 사라지는지 읽는다  2) 확인 문구를 그대로 입력한다
// 버튼 하나로 끝나면 잘못 눌러 계정이 사라진다.
import { useActionState, useState } from 'react';
import { deleteAccount, type DeleteAccountState } from '@/app/lib/actions/account';
import { DELETE_CONFIRM_PHRASE } from '@/app/lib/account-policy';

const initialState: DeleteAccountState = {};

const LOSES = [
  '작성한 글·답글과 받은 좋아요',
  '문제 풀이 기록·제출 이력·AI 면접 리포트',
  'AI Search 대화와 등록한 API 키',
  '보유 포인트와 디베이트샵 주문 내역',
];

export default function DeleteAccount({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const ready = typed.trim() === DELETE_CONFIRM_PHRASE;

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
          className="mt-1.5 w-full max-w-xs rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/25"
        />

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
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-fg-secondary transition-colors hover:text-ink"
          >
            취소
          </button>
        </div>
      </form>
    </div>
  );
}
