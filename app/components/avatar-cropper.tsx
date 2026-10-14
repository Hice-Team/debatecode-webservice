'use client';

// 아바타 고르기 — 1:1로 잘라서 올린다.
//
// 예전에는 고른 파일을 그대로 올렸다. 아바타가 표시되는 자리는 전부 원형인데
// 원본이 세로로 길면 얼굴이 잘리고, 그걸 미리 볼 방법도 없었다. 올리고 나서야
// 알게 되고, 고치려면 다른 사진을 찾아 다시 올려야 했다.
//
// 자르기는 브라우저에서 끝낸다. 서버로 원본을 보내고 잘린 결과를 돌려받으면
// 왕복이 한 번 더 생기고, 그동안 원본이 서버에 남는다. 잘라낸 부분은 애초에
// 서버에 갈 이유가 없다.
import { useEffect, useId, useRef, useState } from 'react';
import Avatar from './avatar';
import Dialog from './dialog';

/** 잘라 낸 결과의 한 변 (px) — 화면에서 가장 크게 쓰이는 자리의 2배 */
const OUTPUT = 512;
/** 자르기 창 안 미리보기의 한 변 */
const VIEWPORT = 264;
const MAX_BYTES = 5 * 1024 * 1024;

export default function AvatarCropper({
  name,
  initialUrl,
  onRemove,
}: {
  /** 잘라 낸 파일이 실릴 input의 name */
  name: string;
  initialUrl: string | null;
  /** "기본 이미지로" — 서버에 저장된 아바타 연결을 끊는다 */
  onRemove?: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [source, setSource] = useState<string | null>(null); // 자르기 대상 원본 objectURL
  const [error, setError] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  // objectURL은 손으로 놓아 준다 — 안 그러면 고를 때마다 메모리에 쌓인다
  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source);
    };
  }, [source]);

  function pickFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 올릴 수 있습니다.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('5MB 이하 이미지만 올릴 수 있습니다.');
      return;
    }
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSource(URL.createObjectURL(file));
  }

  const base = natural.w > 0 ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const scale = base * zoom;
  const drawnW = natural.w * scale;
  const drawnH = natural.h * scale;

  /**
   * 빈틈이 생기지 않게 위치를 가둔다 — 원 밖으로 흰 여백이 보이면 안 된다.
   *
   * 그려진 크기를 인자로 받는다. 확대 막대를 움직일 때는 zoom 상태가 아직 갱신되기 전이라,
   * 바깥의 drawnW를 그대로 쓰면 한 단계 뒤처진 경계로 가두게 된다.
   */
  function clamp(next: { x: number; y: number }, w = drawnW, h = drawnH) {
    const minX = Math.min(0, VIEWPORT - w);
    const minY = Math.min(0, VIEWPORT - h);
    return {
      x: Math.min(0, Math.max(minX, next.x)),
      y: Math.min(0, Math.max(minY, next.y)),
    };
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const el = e.currentTarget;
    const w = el.naturalWidth;
    const h = el.naturalHeight;
    setNatural({ w, h });
    const b = VIEWPORT / Math.min(w, h);
    // 가운데를 잡아 준다
    setOffset({ x: (VIEWPORT - w * b) / 2, y: (VIEWPORT - h * b) / 2 });
  }

  async function confirmCrop() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError('이 브라우저에서는 자르기를 지원하지 않습니다.');
      return;
    }
    const k = OUTPUT / VIEWPORT;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, offset.x * k, offset.y * k, drawnW * k, drawnH * k);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.92),
    );
    if (!blob) {
      setError('이미지를 만들지 못했습니다. 다른 파일로 시도해 주세요.');
      return;
    }

    // 실제 <input>에 실어야 폼과 함께 서버로 간다 — 상태에만 담으면
    // 화면에는 보이는데 제출에는 아무것도 실리지 않는다.
    const file = new File([blob], 'avatar.webp', { type: 'image/webp' });
    const dt = new DataTransfer();
    dt.items.add(file);
    if (inputRef.current) {
      inputRef.current.files = dt.files;
      // 하단 저장 바가 "바뀐 것이 있다"를 알아채도록 알린다
      inputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setPreview(URL.createObjectURL(blob));
    closeCrop();
  }

  function closeCrop() {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setNatural({ w: 0, h: 0 });
  }

  return (
    <div>
      <input ref={inputRef} id={id} type="file" name={name} accept="image/*" className="sr-only" />
      {/* 원본을 고르는 입력은 폼에 실리지 않는다 — 서버로 가는 것은 잘라 낸 결과뿐이다 */}
      <input
        id={`${id}-src`}
        type="file"
        accept="image/*"
        onChange={(e) => {
          pickFile(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = '';
        }}
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-4">
        <Avatar
          src={preview}
          alt="프로필 이미지 미리보기"
          className="h-16 w-16 shrink-0 rounded-full border border-hairline"
        />
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={`${id}-src`}
            className="dc-tap inline-flex min-h-10 cursor-pointer items-center rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-signal"
          >
            이미지 고르기
          </label>
          {(preview || initialUrl) && onRemove && (
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                if (inputRef.current) inputRef.current.value = '';
                onRemove();
              }}
              className="dc-tap inline-flex min-h-10 items-center rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-medium text-fg-muted transition-colors hover:border-fg-quiet hover:text-fg"
            >
              기본 이미지로
            </button>
          )}
        </div>
      </div>
      <p className="mt-1.5 text-[12px] text-fg-muted">
        정사각형으로 잘라 올립니다. 5MB 이하 이미지.
      </p>
      {error && <p className="mt-1.5 text-[13px] text-rose-600">{error}</p>}

      <Dialog
        open={!!source}
        onClose={closeCrop}
        title="프로필 이미지 자르기"
        desc="끌어서 위치를 잡고, 아래 막대로 크기를 맞추세요."
        footer={
          <>
            <button
              type="button"
              onClick={closeCrop}
              className="dc-tap min-h-10 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg"
            >
              취소
            </button>
            <button
              type="button"
              onClick={confirmCrop}
              className="dc-tap min-h-10 rounded-[var(--radius-card)] bg-signal px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              이 모양으로 쓰기
            </button>
          </>
        }
      >
        <div className="flex flex-col items-center">
          <div
            className="relative touch-none overflow-hidden rounded-full border border-hairline bg-paper"
            style={{ width: VIEWPORT, height: VIEWPORT }}
            onPointerDown={(e) => {
              dragging.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!dragging.current) return;
              setOffset(clamp({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y }));
            }}
            onPointerUp={() => {
              dragging.current = null;
            }}
            onPointerCancel={() => {
              dragging.current = null;
            }}
          >
            {source && (
              <img
                ref={imgRef}
                src={source}
                alt=""
                onLoad={onImageLoad}
                draggable={false}
                className="max-w-none select-none"
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: drawnW || undefined,
                  height: drawnH || undefined,
                }}
              />
            )}
          </div>

          <label className="mt-4 flex w-full max-w-[264px] items-center gap-3">
            <span className="sr-only">확대 비율</span>
            <span aria-hidden className="text-[11px] text-fg-quiet">
              작게
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => {
                const next = Number(e.target.value);
                // 확대하면 그림이 커진다 — 가운데를 기준으로 늘려야 보고 있던 자리가 유지된다
                const ratio = next / zoom;
                const nextW = natural.w * base * next;
                const nextH = natural.h * base * next;
                setZoom(next);
                setOffset((prev) =>
                  clamp(
                    {
                      x: VIEWPORT / 2 - (VIEWPORT / 2 - prev.x) * ratio,
                      y: VIEWPORT / 2 - (VIEWPORT / 2 - prev.y) * ratio,
                    },
                    nextW,
                    nextH,
                  ),
                );
              }}
              className="h-1 flex-1 accent-[#4531d9]"
            />
            <span aria-hidden className="text-[11px] text-fg-quiet">
              크게
            </span>
          </label>
        </div>
      </Dialog>
    </div>
  );
}
