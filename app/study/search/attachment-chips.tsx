'use client';

// 이미 보낸 질문에 붙어 있던 첨부 — 대화 기록에서 되짚어 볼 때 쓴다.
//
// 입력 중일 때와 같은 카드로 그린다. 붙일 때는 카드였는데 보내고 나면 전혀 다른 모양이
// 되면, 같은 파일인지 눈으로 대조해야 한다. 기록에서는 지울 수 없으므로 삭제 버튼만 빠진다.
import AttachmentCarousel from './attachment-carousel';
import type { PendingAttachment } from './pending-attachments';

export default function AttachmentChips({
  files,
  align = 'start',
  className = '',
}: {
  files: PendingAttachment[];
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  if (files.length === 0) return null;
  // 캐러셀 트랙은 블록 요소라 justify-*로는 정렬되지 않는다 — 폭을 내용에 맞춘 뒤 여백으로 민다.
  // (질문 말풍선은 오른쪽에 붙으므로 그 아래 첨부도 오른쪽 끝을 맞춰야 한 덩어리로 읽힌다.)
  const place =
    align === 'center' ? 'mx-auto w-fit max-w-full' : align === 'end' ? 'ml-auto w-fit max-w-full' : '';
  return <AttachmentCarousel files={files} className={`${place} ${className}`} />;
}
