'use client';

// 다크 전용 푸터 — 언어 컨텍스트에 따라 번역 렌더링.
import Link from 'next/link';
import Image from 'next/image';
import { NAV_MENUS } from './nav-menus';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

export default function Footer() {
  const { language } = useLanguage();

  return (
    <footer className="w-full bg-ink text-fg-on-dark-secondary border-t border-white/10">
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="inline-block">
              <Image src="/logo-dark.png" alt="Debate Code" width={805} height={310} className="h-7 w-auto object-contain" />
            </Link>
            <p className="text-sm text-fg-on-dark-muted max-w-sm leading-relaxed">{t('footer-desc', language)}</p>
          </div>

          {/* 헤더 메뉴와 동기화된 서비스 링크 */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white tracking-wider">{t('footer-service', language)}</h4>
            <ul className="space-y-2 text-sm">
              {NAV_MENUS.map((m) => (
                <li key={m.href}>
                  <Link href={m.href} className="hover:text-white transition">
                    {t(m.key, language)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-white tracking-wider">{t('footer-support', language)}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/dashboard" className="hover:text-white transition">{t('dashboard', language)}</Link></li>
              <li><Link href="/settings/ai" className="hover:text-white transition">{t('select-ai-provider', language)}</Link></li>
              <li><Link href="/community?board=qna" className="hover:text-white transition">{t('footer-inquiry', language)}</Link></li>
            </ul>
          </div>
        </div>

        <hr className="border-white/10 my-6" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs text-fg-on-dark-quiet">
          <div className="space-y-1">
            <p>{t('footer-rep', language)}</p>
            <p>{t('email', language)}: hicecorp.team@gmail.com</p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/legal/terms" className="hover:text-fg-on-dark-secondary transition underline underline-offset-2">{t('footer-terms', language)}</Link>
              <Link href="/legal/ai-terms" className="hover:text-fg-on-dark-secondary transition underline underline-offset-2">{t('footer-ai-terms', language)}</Link>
              <Link href="/legal/privacy" className="hover:text-fg-on-dark-secondary transition underline underline-offset-2 font-medium">{t('footer-privacy', language)}</Link>
              <Link href="/legal/consent" className="hover:text-fg-on-dark-secondary transition underline underline-offset-2">{t('footer-consent', language)}</Link>
              <Link href="/legal/mate-terms" className="hover:text-fg-on-dark-secondary transition underline underline-offset-2">{t('footer-mate-terms', language)}</Link>
              <Link href="/legal/point-terms" className="hover:text-fg-on-dark-secondary transition underline underline-offset-2">{t('footer-point-terms', language)}</Link>
            </div>
          </div>
          <div className="text-right space-y-1">
            <p className="font-light">&copy; {new Date().getFullYear()} Debate Code. All rights reserved.</p>
            <p>Hosted on Cloudflare</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
