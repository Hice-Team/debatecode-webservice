import type { Metadata } from 'next';
import Link from 'next/link';
import Nav from '@/app/components/nav';
import Footer from '@/app/components/footer';
import { getUser } from '@/app/lib/dal';
import { hasConsoleAccess, roleLabel } from '@/app/lib/roles';
import PersonalDashboard from './personal-dashboard';

export const metadata: Metadata = { title: '대시보드' };

// 개인 대시보드 — 운영 기능은 /console(관리 콘솔)로 분리됐다.
// 콘솔 권한 역할에게는 상단에 관리 콘솔 바로가기 배너만 노출한다.
export default async function DashboardPage() {
  const user = await getUser();

  return (
    <div className="flex flex-col min-h-screen bg-paper text-fg">
      <Nav />
      {hasConsoleAccess(user.role) && (
        <div className="border-b border-brand-100 bg-brand-50/70">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-2.5 sm:px-8">
            <span className="hidden font-mono text-[10px] font-bold tracking-wider text-brand-600 sm:inline">ADMIN</span>
            <p className="text-xs text-fg-secondary">
              {roleLabel(user.role)} 권한으로 접속 중입니다. 운영 기능은 관리 콘솔에서 사용할 수 있어요.
            </p>
            <Link
              href="/console"
              className="ml-auto shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-500"
            >
              관리 콘솔 열기 →
            </Link>
          </div>
        </div>
      )}
      <PersonalDashboard userId={user.id} name={user.name} role={user.role} />
      <Footer />
    </div>
  );
}
