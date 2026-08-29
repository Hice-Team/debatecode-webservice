'use client';

// 파일을 크게 열어 보는 창.
//
// 받은 것이 File이면 브라우저 안에서 URL을 만들어 띄우고, 주소면 그대로 띄운다.
// 미리볼 수 있는 것만 그린다 — 이미지·영상·오디오·PDF·텍스트.
// 그 밖에는 **미리볼 수 없다고 말한다**. 빈 상자를 띄우면 사용자는 로딩 중인지
// 실패한 것인지 알 수 없고, 그게 가장 나쁜 상태다.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

const subscribeNever = () => () => {};

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'none';

/** 확장자와 MIME으로 무엇을 그릴지 정한다. 둘 다 없으면 미리보기를 포기한다. */
export function previewKind(nameOrUrl: string, mime?: string): PreviewKind {
  const ext = (nameOrUrl.split('?')[0].split('.').pop() ?? '').toLowerCase();
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(ext)) return 'image';
  if (m.startsWith('video/') || ['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return 'archive';
  if (
    m.startsWith('text/') ||
    ['txt', 'md', 'json', 'csv', 'js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'rb', 'php', 'sql', 'yml', 'yaml', 'html', 'css'].includes(ext)
  )
    return 'text';
  return 'none';
}

export default function Lightbox({
  open,
  title,
  file,
  src,
  mime,
  /** 압축 파일이면 안에 든 목록을 넘겨받아 보여 준다 */
  entries,
  onClose,
}: {
  open: boolean;
  title: string;
  file?: File | null;
  src?: string;
  mime?: string;
  entries?: string[];
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [text, setText] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const kind = previewKind(file?.name ?? src ?? title, mime ?? file?.type);

  // File은 브라우저 안에서만 주소를 갖는다. 상태로 두면 effect에서 setState를 부르게 되고
  // 그만큼 한 번 더 렌더된다 — 값으로 뽑고, 다 쓰면 effect가 돌려주기만 한다.
  const objectUrl = useMemo(() => (open && file ? URL.createObjectURL(file) : null), [open, file]);
  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  // 텍스트는 앞부분만 읽는다 — 큰 파일을 통째로 그리면 창이 멎는다.
  useEffect(() => {
    if (!open || kind !== 'text' || !file) return;
    let alive = true;
    file
      .slice(0, 200_000)
      .text()
      .then((t) => alive && setText(t))
      .catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, [open, kind, file]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  const url = objectUrl ?? src ?? '';

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="닫기"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/70 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[calc(100dvh-2rem)] w-[min(56rem,100%)] flex-col overflow-hidden rounded-[var(--radius-panel)] bg-surface shadow-2xl shadow-black/40"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-hairline px-5 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="dc-tap grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg-quiet transition-colors hover:bg-paper hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2]" aria-hidden>
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="dc-scroll min-h-0 flex-1 overflow-auto bg-paper p-4">
          {kind === 'image' && (
            /* blob: URL은 next/image가 다루지 못해 <img>를 그대로 쓴다 */
            <img src={url} alt={title} className="mx-auto max-h-[70dvh] max-w-full rounded-[var(--radius-card)]" />
          )}
          {kind === 'video' && (
            <video src={url} controls className="mx-auto max-h-[70dvh] w-full rounded-[var(--radius-card)]" />
          )}
          {kind === 'audio' && <audio src={url} controls className="w-full" />}
          {kind === 'pdf' && (
            <iframe src={url} title={title} className="h-[70dvh] w-full rounded-[var(--radius-card)] bg-surface" />
          )}
          {kind === 'text' && (
            <pre className="dc-scroll max-h-[70dvh] overflow-auto rounded-[var(--radius-card)] bg-surface p-4 font-mono text-[12.5px] leading-relaxed text-fg-secondary">
              {text ?? '읽는 중…'}
            </pre>
          )}
          {kind === 'archive' && (
            <div className="rounded-[var(--radius-card)] bg-surface p-5">
              <p className="text-sm font-semibold text-fg">압축 파일 안의 목록</p>
              {entries && entries.length > 0 ? (
                <ul className="dc-scroll mt-3 max-h-[60dvh] space-y-1 overflow-auto font-mono text-[12.5px] text-fg-secondary">
                  {entries.map((e) => (
                    <li key={e} className="truncate border-b border-hairline py-1.5 last:border-0">
                      {e}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-fg-muted">목록을 읽지 못했습니다. 내려받아 확인해 주세요.</p>
              )}
            </div>
          )}
          {kind === 'none' && (
            <p className="rounded-[var(--radius-card)] border border-dashed border-hairline bg-surface px-6 py-12 text-center text-sm leading-relaxed text-fg-muted">
              이 형식은 미리볼 수 없습니다.
              <br />
              내려받아 확인해 주세요.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
