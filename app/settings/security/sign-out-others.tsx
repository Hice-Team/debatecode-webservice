'use client';

// 다른 기기 전부 로그아웃.
//
// 기기를 하나씩 끊는 버튼과 따로 둔다. 목록에서 하나씩 끊는 것은 "이 기기는 이제 안 써"이고,
// 이 버튼은 "누가 들어와 있는 것 같다"다. 급한 쪽이라 목록보다 위에 두고, 대신 확인을 받는다.
import { useState, useTransition } from 'react';
import Dialog from '@/app/components/dialog';
import { signOutOtherDevices } from '@/app/lib/actions/settings';

export default function SignOutOthers({ otherCount }: { otherCount: number }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={otherCount === 0}
        className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-40 disabled:hover:border-hairline disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        {otherCount === 0 ? '다른 기기 없음' : '다른 기기 모두 로그아웃'}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        tone="danger"
        width="sm"
        title="다른 기기에서 모두 로그아웃"
        desc="지금 보고 있는 이 기기는 그대로 유지됩니다. 다른 곳에서 열려 있던 창은 다음 요청부터 로그인 화면으로 돌아갑니다."
        footer={
          <>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="dc-tap min-h-10 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg"
            >
              취소
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await signOutOtherDevices();
                  setOpen(false);
                })
              }
              className="dc-tap min-h-10 rounded-[var(--radius-card)] bg-rose-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40"
            >
              {pending ? '끊는 중…' : '모두 로그아웃'}
            </button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-fg-secondary">
          계정을 다른 사람이 쓰고 있는 것 같다면, 로그아웃한 다음{' '}
          <strong className="text-fg">비밀번호도 함께 바꿔 주세요.</strong> 비밀번호가 그대로면 다시
          들어올 수 있습니다.
        </p>
      </Dialog>
    </>
  );
}
