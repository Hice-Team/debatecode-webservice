'use client';

// 첨부 컴포저 — 이미지/파일/링크/유튜브/투표 첨부 상태를 관리하고 폼 필드로 직렬화한다.
// 툴바 버튼이 부모를 거쳐 imperative handle(pickImage 등)을 호출하는 구조.
// 서버 액션(createPost/updatePost)은 images·files(File[]), links·youtubeUrls(줄 단위),
// pollQuestion·pollOptions 필드를 읽는다.
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

export interface AttachmentComposerHandle {
  pickImage: () => void;
  pickFile: () => void;
  addLink: () => void;
  addYoutube: () => void;
  togglePoll: () => void;
}

const MAX_FILES = 5;
const MAX_IMAGES = 5;
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 6;

function isYoutubeUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
  } catch {
    return false;
  }
}

function Chip({ icon, label, onRemove }: { icon: string; label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-1 text-xs text-ink-soft/70">
      <span aria-hidden>{icon}</span>
      <span className="truncate max-w-56">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        title="첨부 제거"
        className="text-ink-soft/40 hover:text-rose-500 transition-colors"
      >
        ✕
      </button>
    </span>
  );
}

export default function AttachmentComposer({ ref }: { ref: Ref<AttachmentComposerHandle> }) {
  const [images, setImages] = useState<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const [youtubes, setYoutubes] = useState<string[]>([]);
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File[] 상태를 실제 폼 필드(input.files)에 동기화 — 제거를 지원하기 위함
  useEffect(() => {
    const input = imageInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    images.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  }, [images]);
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    input.files = dt.files;
  }, [files]);

  useImperativeHandle(ref, () => ({
    pickImage: () => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/*';
      picker.multiple = true;
      picker.onchange = () => {
        const picked = Array.from(picker.files ?? []);
        setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
      };
      picker.click();
    },
    pickFile: () => {
      const picker = document.createElement('input');
      picker.type = 'file';
      picker.multiple = true;
      picker.onchange = () => {
        const picked = Array.from(picker.files ?? []);
        setFiles((prev) => [...prev, ...picked].slice(0, MAX_FILES));
      };
      picker.click();
    },
    addLink: () => {
      const url = window.prompt('첨부할 링크 URL을 입력하세요 (http/https)');
      if (!url) return;
      if (!/^https?:\/\//i.test(url.trim())) {
        window.alert('http:// 또는 https:// 로 시작하는 URL만 첨부할 수 있습니다.');
        return;
      }
      setLinks((prev) => (prev.includes(url.trim()) ? prev : [...prev, url.trim()]));
    },
    addYoutube: () => {
      const url = window.prompt('유튜브 영상 URL을 입력하세요');
      if (!url) return;
      if (!isYoutubeUrl(url.trim())) {
        window.alert('유튜브 URL이 아닙니다. (youtube.com / youtu.be)');
        return;
      }
      setYoutubes((prev) => (prev.includes(url.trim()) ? prev : [...prev, url.trim()]));
    },
    togglePoll: () => setShowPoll((v) => !v),
  }));

  const hasChips = images.length + files.length + links.length + youtubes.length > 0;

  return (
    <div className="space-y-3">
      {/* 서버 액션이 읽는 실제 폼 필드 */}
      <input ref={imageInputRef} name="images" type="file" multiple accept="image/*" className="hidden" tabIndex={-1} />
      <input ref={fileInputRef} name="files" type="file" multiple className="hidden" tabIndex={-1} />
      <input type="hidden" name="links" value={links.join('\n')} />
      <input type="hidden" name="youtubeUrls" value={youtubes.join('\n')} />

      {/* 이미지 미리보기 */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative">
              <img
                src={URL.createObjectURL(f)}
                alt={f.name}
                className="h-20 w-20 rounded-lg border border-ink/10 object-cover"
              />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                title="이미지 제거"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[10px] text-white hover:bg-rose-500"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 파일/링크/유튜브 칩 */}
      {hasChips && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <Chip key={`f-${f.name}-${i}`} icon="📎" label={f.name} onRemove={() => setFiles((p) => p.filter((_, idx) => idx !== i))} />
          ))}
          {links.map((url) => (
            <Chip key={`l-${url}`} icon="🔗" label={url} onRemove={() => setLinks((p) => p.filter((v) => v !== url))} />
          ))}
          {youtubes.map((url) => (
            <Chip key={`y-${url}`} icon="▶" label={url} onRemove={() => setYoutubes((p) => p.filter((v) => v !== url))} />
          ))}
        </div>
      )}

      {/* 투표 작성 */}
      {showPoll && (
        <div className="rounded-xl border border-ink/10 bg-paper/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-ink-soft/60 tracking-wider">📊 투표 만들기</span>
            <button
              type="button"
              onClick={() => setShowPoll(false)}
              className="text-xs text-ink-soft/40 hover:text-rose-500 transition-colors"
            >
              투표 제거
            </button>
          </div>
          <input
            name="pollQuestion"
            type="text"
            maxLength={100}
            placeholder="투표 질문 (선택)"
            className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60"
          />
          <div className="space-y-2">
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name="pollOptions"
                  type="text"
                  value={opt}
                  maxLength={50}
                  onChange={(e) => setPollOptions((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                  placeholder={`선택지 ${i + 1}`}
                  className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm placeholder:text-ink-soft/30 focus:outline-none focus:ring-2 focus:ring-signal/60"
                />
                {pollOptions.length > MIN_POLL_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => setPollOptions((prev) => prev.filter((_, idx) => idx !== i))}
                    title="선택지 제거"
                    className="shrink-0 h-9 w-9 rounded-lg border border-ink/15 text-ink-soft/50 hover:border-rose-300 hover:text-rose-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {pollOptions.length < MAX_POLL_OPTIONS && (
            <button
              type="button"
              onClick={() => setPollOptions((prev) => [...prev, ''])}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              + 선택지 추가
            </button>
          )}
        </div>
      )}

      {/* 투표를 닫으면 폼에 값이 남지 않도록 — showPoll일 때만 위 입력들이 렌더된다 */}
    </div>
  );
}
