'use client';

// 모바일 햄버거 메뉴 전용 프로필 섹션.
// 아바타 + 이름/이메일 헤더를 누르면 설정 리스트가 펼쳐지고(아코디언),
// 로그아웃은 리스트가 아니라 헤더 오른쪽 끝에 아이콘 버튼으로 둔다.
import { useState } from 'react';
import Link from 'next/link';
import { logout } from '@/app/lib/actions/auth';
import Avatar from './avatar';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

interface Props {
  name: string;
  email: string;
  avatarUrl?: string | null;
}

// 데스크톱 프로필 메뉴와 같은 구성 — 갈라져 있던 설정 항목은 "설정" 하나로 모았다
const PROFILE_LINKS = [
  { href: '/dashboard', key: 'dashboard', label: '대시보드' },
  { href: '/problems/mine', key: 'my-problems', label: '내 문제집' },
  { href: '/debate-mate', key: 'debate-mate', label: '디베이트메이트' },
  { href: '/settings', key: 'settings', label: '설정' },
];

const row =
  'block rounded-lg px-3 py-2.5 text-sm font-medium text-fg-secondary hover:bg-paper hover:text-fg transition-colors';

export default function MobileAuthProfile({ name, email, avatarUrl }: Props) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      {/* 헤더 — 클릭 시 리스트 토글 + 오른쪽 끝 로그아웃 */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-paper"
        >
          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-signal bg-paper">
            <Avatar src={avatarUrl} alt={name} className="h-full w-full" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-fg">{name}</span>
            <span className="block truncate text-xs text-fg-muted">{email}</span>
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-fg-quiet transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <form action={logout}>
          <button
            type="submit"
            aria-label={t('logout', language)}
            title={t('logout', language)}
            className="grid h-9 w-9 place-items-center rounded-lg text-rose-500 transition-colors hover:bg-rose-500/10 hover:text-rose-600"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
              <path d="M10 17 5 12l5-5" />
              <path d="M5 12h12" />
            </svg>
          </button>
        </form>
      </div>

      {/* 설정 리스트 — 헤더 토글로 노출 */}
      {open && (
        <div className="flex flex-col gap-1">
          {PROFILE_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={row}>
              {t(l.key, language)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
