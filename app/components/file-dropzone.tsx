'use client';

// 파일 한 장을 받는 자리 — 끌어다 놓거나 눌러서 고른다.
//
// 고른 뒤에는 파일 이름만 적어 두지 않고 **미리보기 카드**로 보여 준다.
// 신청서처럼 한 번 올리면 되돌리기 어려운 파일은, 올린 사람이 "그 파일이 맞는지"를
// 제출 전에 확인할 수 있어야 한다. 카드를 누르면 크게 열리고, X로 뺄 수 있다.
import { useId, useState } from 'react';
import Lightbox from './lightbox';

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDropzone({
  name,
  accept,
  file,
  onFile,
  hint,
}: {
  name: string;
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  hint: string;
}) {
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState(false);
  const id = useId();

  /**
   * 파일을 실제 <input>에 실어 두는 것이 이 컴포넌트의 핵심이다.
   *
   * 서버 액션은 폼 안의 input에서 파일을 읽는다. 상태에만 담으면 화면에는 보이는데
   * 제출에는 아무것도 실리지 않는다 — 처음에 그렇게 만들었다가, 고른 순간 input이
   * 다른 DOM 노드로 교체되면서 파일이 사라졌다.
   * 그래서 input은 상태와 무관하게 **한 번만** 그리고 위치도 바뀌지 않는다.
   */
  function accepted(input: HTMLInputElement, list: FileList | null) {
    const picked = list?.[0] ?? null;
    if (!picked) return;
    if (list && input.files !== list) {
      const dt = new DataTransfer();
      dt.items.add(picked);
      input.files = dt.files;
    }
    onFile(picked);
  }

  return (
    <>
      {/* 상태가 바뀌어도 이 input은 그대로다 — 여기 담긴 파일이 곧 제출될 파일이다 */}
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        onChange={(e) => accepted(e.currentTarget, e.currentTarget.files)}
        className="sr-only"
      />

      {file ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-hairline bg-surface p-3">
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <span
              aria-hidden
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-card)] bg-rose-50 font-mono text-[10px] font-bold text-rose-600"
            >
              PDF
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-fg">{file.name}</span>
              <span className="block font-mono text-[11px] text-fg-muted">
                {sizeLabel(file.size)} · 눌러서 확인
              </span>
            </span>
          </button>
          <label
            htmlFor={id}
            className="dc-tap grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-fg-quiet transition-colors hover:bg-paper hover:text-fg"
            title="다른 파일로 바꾸기"
          >
            <span className="sr-only">다른 파일로 바꾸기</span>
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
              <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </label>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const input = document.getElementById(id) as HTMLInputElement | null;
            if (input) accepted(input, e.dataTransfer.files);
          }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-panel)] border border-dashed px-4 py-7 text-center transition-colors ${
            over ? 'border-signal bg-brand-50' : 'border-hairline bg-paper hover:border-brand-300'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-current stroke-[1.5] text-fg-quiet" aria-hidden>
            <path d="M12 16V5m0 0L8 9m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 17v1.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V17" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-medium text-fg">
            {over ? '여기에 놓으세요' : '파일을 끌어다 놓거나 눌러서 고르세요'}
          </span>
          <span className="text-[11px] text-fg-muted">{hint}</span>
        </label>
      )}

      <Lightbox open={preview} title={file?.name ?? ''} file={file} onClose={() => setPreview(false)} />
    </>
  );
}
