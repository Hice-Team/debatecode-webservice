'use client';

// 비로그인 상태의 로그인/회원가입 버튼 — 언어 전환에 반응한다.
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

export default function AuthButtons() {
  const { language } = useLanguage();

  return (
    <>
      <Link href="/login" className="px-4 py-2 text-fg-secondary hover:text-fg transition-colors text-center">
        {t('login', language)}
      </Link>
      <Link
        href="/signup"
        className="px-4 py-2 bg-brand-600 text-white font-semibold rounded-full hover:bg-brand-500 active:scale-[0.98] transition text-center"
      >
        {t('signup', language)}
      </Link>
    </>
  );
}
