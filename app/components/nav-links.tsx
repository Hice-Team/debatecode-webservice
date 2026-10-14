'use client';

import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

interface Props {
  links: readonly { href: string; key: string }[];
}

export default function NavLinks({ links }: Props) {
  const { language } = useLanguage();

  return (
    <ul className="hidden md:flex items-center gap-7 text-sm font-medium text-fg-secondary [.dc-nav-dark_&]:text-fg-on-dark-secondary">
      {links.map((m) => (
        <li key={m.href}>
          <Link href={m.href} className="transition-colors hover:text-fg [.dc-nav-dark_&]:hover:text-fg-on-dark">
            {t(m.key, language)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
