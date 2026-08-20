'use client';

// 첨부 썸네일 — 붙인 것이 무엇인지 한눈에 구분되도록 종류별로 다르게 그린다.
//
//   image  실제 그림 미리보기
//   code   확장자 타일 + 코드 앞 세 줄(모노스페이스)
//   link   출처 카드 — 호스트 머리글자 · 제목 · 발췌. 눌러서 원문을 연다
//   file   확장자 타일 + 용량
//
// 출처(local/drive/github/url)는 타일 좌하단 배지로 겹쳐 표시한다.
// 좁은 화면에서는 칩이 한 줄을 다 쓰고, 삭제 버튼은 호버 없이도 보인다(터치 대응).
import { useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import { extLabel, formatBytes, type PendingAttachment } from './pending-attachments';
import AttachmentPreview from './attachment-preview';

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  drive: { label: 'Drive', className: 'bg-[#1a73e8]' },
  github: { label: 'GitHub', className: 'bg-ink' },
  url: { label: 'URL', className: 'bg-brand-600' },
  local: { label: '내 기기', className: 'bg-ink-soft/70' },
};

const KIND_TILE: Record<string, string> = {
  image: 'from-brand-100 to-brand-50 text-brand-700',
  code: 'from-emerald-100 to-emerald-50 text-emerald-700',
  link: 'from-sky-100 to-sky-50 text-sky-700',
  file: 'from-ink/[0.07] to-ink/[0.03] text-fg-muted',
};

const CARD =
  'group relative flex w-full items-start gap-2.5 rounded-[var(--radius-panel)] border border-hairline bg-white p-2 transition hover:border-brand-300 sm:w-auto sm:max-w-[17rem]';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 코드·문서 미리보기 — 앞 세 줄만, 너무 긴 줄은 잘라 쓴다. */
function previewLines(preview: string | undefined, max: number): string[] {
  if (!preview) return [];
  return preview
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((line) => (line.length > 46 ? `${line.slice(0, 46)}…` : line));
}

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`${label} 제거`}
      // 터치 기기에는 호버가 없다 — 작은 화면에서는 항상 보이게 둔다
      className="absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full border border-hairline bg-white text-[11px] leading-none text-fg-muted shadow-sm transition hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
    >
      ×
    </button>
  );
}

function SourceBadge({ source }: { source?: string }) {
  const badge = source ? SOURCE_BADGE[source] : undefined;
  if (!badge) return null;
  return (
    <span
      className={`absolute -bottom-1 -left-1 rounded-full px-1.5 py-px text-[8px] font-semibold text-white shadow-sm ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

/** URL 첨부 — 파일이 아니라 "출처"이므로 링크 카드 모양으로 따로 그린다. */
function LinkChip({ file, onRemove }: { file: PendingAttachment; onRemove?: () => void }) {
  const host = hostOf(file.url) || file.name;
  const excerpt = previewLines(file.preview, 2);

  return (
    <li className={`${CARD} overflow-hidden`}>
      {onRemove && <RemoveButton label={file.name} onRemove={onRemove} />}

      <a
        href={file.url}
        target="_blank"
        rel="noreferrer noopener"
        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-signal"
        title={file.url}
      >
        {/* 호스트 머리글자 타일 — 외부 파비콘을 불러오지 않아 추적이 남지 않는다 */}
        <span className="relative shrink-0">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-sky-50 text-base font-bold uppercase text-sky-700"
          >
            {host.charAt(0)}
          </span>
          <SourceBadge source={file.source} />
        </span>

        <span className="min-w-0 flex-1 py-0.5">
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 fill-none stroke-current stroke-2 text-sky-600" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
            </svg>
            <span className="truncate font-mono text-[10px] text-fg-muted">{host}</span>
            <span aria-hidden className="ml-auto shrink-0 text-[10px] text-fg-quiet">↗</span>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs font-medium leading-snug text-ink">{file.name}</span>
          {excerpt.length > 0 && (
            <span className="mt-1 line-clamp-2 block text-[10px] leading-relaxed text-fg-muted">
              {excerpt.join(' ')}
            </span>
          )}
        </span>
      </a>
    </li>
  );
}

export function AttachmentChip({
  file,
  onRemove,
  onPreview,
}: {
  file: PendingAttachment;
  onRemove?: () => void;
  /** 미리보기를 열 수 있으면 넘어온다 — 없으면 카드는 그냥 표시용이다 */
  onPreview?: () => void;
}) {
  const { language } = useLanguage();
  if (file.kind === 'link') return <LinkChip file={file} onRemove={onRemove} />;

  const lines = previewLines(file.preview, 3);
  const meta = [formatBytes(file.size), file.kind === 'code' ? extLabel(file.name) : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={`${CARD} ${onPreview ? 'cursor-pointer hover:shadow-md hover:shadow-ink/[0.06]' : ''}`}>
      {onRemove && <RemoveButton label={file.name} onRemove={onRemove} />}

      {/* 카드 전체가 미리보기 버튼 — 구글 드라이브처럼 눌러서 확인하고 닫는다.
          삭제 버튼(z-10)은 이 위에 떠 있어 그대로 눌린다. */}
      {onPreview && (
        <button
          type="button"
          onClick={onPreview}
          className="absolute inset-0 z-0 rounded-[var(--radius-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          aria-label={`${file.name} ${t('preview-open', language)}`}
        />
      )}

      {/* 썸네일 */}
      <span className="pointer-events-none relative shrink-0">
        {file.kind === 'image' && (file.previewUrl || file.url) ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage 공개 URL을 그대로 쓴다(최적화 대상 아님)
          <img
            src={file.previewUrl || file.url}
            alt=""
            loading="lazy"
            className="h-12 w-12 rounded-xl border border-hairline bg-paper object-cover"
          />
        ) : (
          <span
            aria-hidden
            className={`grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br font-mono text-[10px] font-bold tracking-tight ${
              KIND_TILE[file.kind] ?? KIND_TILE.file
            }`}
          >
            {extLabel(file.name)}
          </span>
        )}
        <SourceBadge source={file.source} />
      </span>

      {/* 이름 · 부가정보 · 발췌 */}
      <span className="pointer-events-none min-w-0 flex-1 py-0.5 pr-1">
        <span className="block truncate text-xs font-medium text-ink" title={file.name}>
          {file.name}
        </span>
        {meta && <span className="mt-0.5 block truncate font-mono text-[10px] text-fg-quiet">{meta}</span>}
        {lines.length > 0 && (
          <span className="mt-1 block overflow-hidden rounded-md bg-paper px-1.5 py-1">
            {lines.map((line, i) => (
              <span key={i} className="block truncate font-mono text-[9px] leading-[1.6] text-fg-muted">
                {line}
              </span>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

export default function AttachmentChips({
  files,
  onRemove,
  align = 'start',
  className = '',
}: {
  files: PendingAttachment[];
  onRemove?: (index: number) => void;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  // 미리보기로 넘길 수 있는 첨부만 모은다 — 링크 카드는 원문으로 바로 나가므로 뺀다.
  const viewable = files.filter((file) => file.kind !== 'link');
  const [previewAt, setPreviewAt] = useState<number | null>(null);

  if (files.length === 0) return null;
  const justify = align === 'center' ? 'sm:justify-center' : align === 'end' ? 'sm:justify-end' : 'sm:justify-start';

  return (
    <>
      <ul className={`flex flex-wrap gap-2 ${justify} ${className}`}>
        {files.map((file, index) => {
          const viewableAt = viewable.indexOf(file);
          return (
            <AttachmentChip
              key={`${file.url}-${index}`}
              file={file}
              onRemove={onRemove ? () => onRemove(index) : undefined}
              onPreview={viewableAt >= 0 ? () => setPreviewAt(viewableAt) : undefined}
            />
          );
        })}
      </ul>

      {previewAt !== null && (
        <AttachmentPreview
          files={viewable}
          index={previewAt}
          onIndexChange={setPreviewAt}
          onClose={() => setPreviewAt(null)}
        />
      )}
    </>
  );
}
