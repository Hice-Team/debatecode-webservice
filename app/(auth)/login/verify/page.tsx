import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getPendingSession, twoFactorStatus } from '@/app/lib/dal';
import { getTwoFactorState, maskEmail } from '@/app/lib/two-factor';
import VerifyForm from './verify-form';

export const metadata: Metadata = { title: '2차 인증' };

export default async function LoginVerifyPage({ searchParams }: PageProps<'/login/verify'>) {
  const pending = await getPendingSession();
  if (!pending) redirect('/login');

  // 이미 통과했거나 애초에 2차 인증을 켜지 않은 계정이면 여기 머무를 이유가 없다
  const { required, satisfied } = await twoFactorStatus(pending.userId);
  const query = await searchParams;
  const rawNext = typeof query.next === 'string' ? query.next : '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/login')
    ? rawNext
    : '/dashboard';

  if (!required || satisfied) redirect(next);

  const state = await getTwoFactorState(pending.userId);

  return (
    // 화면 정중앙으로 위치하도록 (가로 세로 모두)
    <div className="flex flex-col items-center justify-center min-h-screen">
      <VerifyForm
        next={next}
        email={pending.email}
        options={{
          totp: state.totp,
          securityKeys: state.securityKeys,
          backupCodesLeft: state.backupCodesLeft,
          recoveryEmailMasked: state.recoveryEmail ? maskEmail(state.recoveryEmail) : null,
        }}
      />
    </div>
  );
}
