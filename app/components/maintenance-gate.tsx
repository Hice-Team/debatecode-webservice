import { headers } from 'next/headers';
import Link from 'next/link';
import { maintenanceState } from '@/app/lib/settings';
import { getSessionWithProfile } from '@/app/lib/dal';
import { hasConsoleAccess } from '@/app/lib/roles';
import { PATHNAME_HEADER } from '@/app/lib/request-context';

// 유지보수 게이트 — 점검 모드가 켜져 있으면 일반 방문자에게 안내 화면만 보여 준다.
//
// 왜 루트 레이아웃인가: 미들웨어(proxy.ts)는 Edge 런타임이라 Prisma를 쓸 수 없어서 설정을
// 읽지 못한다. 그래서 판단은 서버 컴포넌트에서 하고, 경로만 헤더로 받아 온다.
//
// 점검 중에도 열어 두는 경로:
//   /console  운영진이 고치러 들어가는 곳. 여기가 막히면 점검을 끌 방법이 없다.
//   /login    운영진이 로그인해야 콘솔에 들어간다.
//   /auth     OAuth 콜백 — 로그인 흐름 중간이 끊기면 안 된다.
//   /api      헬스체크와 세션 갱신. 화면만 막고 API는 살려 둔다.
const OPEN_PREFIXES = ['/console', '/login', '/auth', '/api', '/unsubscribe', '/legal'];

export default async function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const state = await maintenanceState();
  if (!state.enabled) return <>{children}</>;

  const pathname = (await headers()).get(PATHNAME_HEADER) ?? '';
  if (OPEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <>{children}</>;
  }

  // 콘솔 권한자는 점검 중에도 서비스를 그대로 본다 — 고쳤는지 확인해야 하기 때문이다.
  const viewer = await getSessionWithProfile().catch(() => null);
  if (viewer && hasConsoleAccess(viewer.role)) {
    return (
      <>
        <div className="sticky top-0 z-[60] flex flex-wrap items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-[11px] font-semibold text-amber-950">
          <span aria-hidden>🛠️</span>
          유지보수 모드가 켜져 있습니다 — 일반 이용자에게는 점검 화면만 보입니다.
          <Link href="/console/system/maintenance" className="underline underline-offset-2">
            해제하기
          </Link>
        </div>
        {children}
      </>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 py-16 text-center">
      <div className="max-w-md">
        <p aria-hidden className="text-4xl">
          🛠️
        </p>
        <h1
          className="mt-4 text-2xl font-bold text-ink"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          점검 중입니다
        </h1>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-fg-secondary">{state.message}</p>
        {state.eta && (
          <p className="mt-4 inline-block rounded-full border border-hairline bg-white px-3 py-1 font-mono text-xs text-fg-secondary">
            종료 예정 · {state.eta}
          </p>
        )}
        <p className="mt-8 text-xs text-fg-muted">
          문의가 필요하시면{' '}
          <Link href="/legal/terms" className="underline underline-offset-2">
            이용약관
          </Link>
          의 연락처를 참고해 주세요.
        </p>
      </div>
    </main>
  );
}
