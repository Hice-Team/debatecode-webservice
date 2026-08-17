'use client';

// 프로필 이미지 — URL이 없거나 로드에 실패하면 기본 아바타(/avatar-default.svg)로 대체한다.
import { useState } from 'react';

export default function Avatar({
  src,
  alt,
  className = '',
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = !src || failed ? '/avatar-default.svg' : src;
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
