'use client';

import { useRouter } from 'next/navigation';

interface Props {
  label?: string;
  className?: string;
}

export default function BackButton({ label = '뒤로', className = '' }: Props) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className={`font-mono text-xs text-brand-600 hover:underline inline-flex items-center gap-1 ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
