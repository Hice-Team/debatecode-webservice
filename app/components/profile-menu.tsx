'use client';

// 프로필 드롭다운 — 대시보드 / 내 문제집 / 디베이트메이트 / 설정 / 로그아웃.
//
// 예전에는 프로필·계정·AI·앱 설정이 각각 항목으로 나뉘어 있었다. 어느 것이 무엇을 여는지
// 이름만으로는 구분되지 않았고, 결국 네 곳을 차례로 눌러 보게 됐다. 지금은 "설정" 하나로 모으고
// 그 안에서 갈래를 고른다.
//
// 디베이트메이트는 이미 메이트인 사람에게는 콘솔로, 아닌 사람에게는 신청 페이지로 간다 —
// 같은 자리에서 각자 다음에 할 일로 이어진다.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/lib/actions/auth';
import Avatar from './avatar';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

interface ProfileMenuProps {
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string;
}

const ITEM = 'block px-4 py-2 text-sm text-fg transition-colors hover:bg-paper';

export default function ProfileMenu({ name, email, avatarUrl, role }: ProfileMenuProps) {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // 콘솔을 쓸 수 있는 사람은 메이트와 관리자다(app/lib/actions/mate.ts canUseMateConsole).
  // 여기서 메이트만 보면 관리자가 신청 페이지로 떨어져, 들어갈 수 있는 화면을 못 찾는다.
  const isMate = role === 'debate_mate' || role === 'admin';
  const mateHref = isMate ? '/debate-mate/console' : '/debate-mate';

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // 경로 변경 시 메뉴 닫기 — 라우터라는 외부 상태에 화면을 맞추는 일이라 effect가 맞는 자리다
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 네비게이션 후에도 메뉴가 열린 채 남지 않게 한다
    setIsOpen(false);
  }, [pathname]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative h-10 w-10 overflow-hidden rounded-full border-2 border-signal bg-paper transition-colors hover:border-brand-400"
        aria-label={language === 'ko' ? '프로필 메뉴' : 'Profile menu'}
        aria-expanded={isOpen}
      >
        <Avatar src={avatarUrl} alt={name} className="h-full w-full" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 animate-in rounded-xl border border-hairline bg-surface py-2 shadow-xl shadow-ink/10 duration-200 fade-in zoom-in-95">
          <div className="border-b border-hairline px-4 py-3">
            <p data-no-translate className="text-sm font-semibold text-fg">
              {name}
            </p>
            <p data-no-translate className="truncate text-xs text-fg-muted">
              {email}
            </p>
          </div>

          <div className="py-2">
            <Link href="/dashboard" className={ITEM} onClick={() => setIsOpen(false)}>
              {t('dashboard', language)}
            </Link>
            <Link href="/problems/mine" className={ITEM} onClick={() => setIsOpen(false)}>
              {t('my-problems', language)}
            </Link>
            {/* 내 문제집과 설정 사이 — 메이트면 콘솔로, 아니면 신청 안내로 */}
            <Link href={mateHref} className={ITEM} onClick={() => setIsOpen(false)}>
              <span className="flex items-center gap-2">
                {t('debate-mate', language)}
                {isMate && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                    {t('mate-console-badge', language)}
                  </span>
                )}
              </span>
            </Link>

            {/* 커뮤니티 묶음 — 글·거래·문의는 성격이 달라 대시보드 한 칸에 뭉쳐 두면
                "내가 올린 중고 물건"을 찾으러 매번 헤매게 된다. 갈 곳을 이름으로 나눈다. */}
            <div className="my-1 border-t border-hairline" />
            <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-fg-quiet">
              {t('community', language)}
            </p>
            <Link href="/dashboard/community-profile" className={ITEM} onClick={() => setIsOpen(false)}>
              {t('profile-community', language)}
            </Link>
            <Link href="/dashboard/market" className={ITEM} onClick={() => setIsOpen(false)}>
              {t('profile-market', language)}
            </Link>
            <div className="my-1 border-t border-hairline" />

            <Link href="/settings" className={ITEM} onClick={() => setIsOpen(false)}>
              {t('settings', language)}
            </Link>
          </div>

          <div className="border-t border-hairline py-2">
            <form action={logout} className="px-4 py-0">
              <button
                type="submit"
                className="w-full rounded px-0 py-2 text-left text-sm text-rose-500 transition-colors hover:bg-rose-500/10"
              >
                {t('logout', language)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
