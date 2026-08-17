'use client';

// 서버 컴포넌트가 넘긴 한국어 원문(fallback)을 언어 설정에 따라 영어 사전 값으로 치환한다.
// 사전에 키가 없으면 원문을 그대로 보여줘 어떤 페이지에서도 깨지지 않는다.
import { useLanguage } from '@/app/context/language-context';
import { translations } from '@/app/lib/i18n';

export default function I18nSlot({ k, fallback }: { k: string; fallback: React.ReactNode }) {
  const { language } = useLanguage();
  if (language === 'ko') return <>{fallback}</>;
  return <>{translations.en[k] ?? fallback}</>;
}
