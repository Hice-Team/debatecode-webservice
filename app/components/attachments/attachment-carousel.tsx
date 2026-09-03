'use client';

// 입력창 **안쪽**에 눕는 첨부 카드 캐러셀.
//
// 카드는 정사각형이다. 파일 이름 길이에 따라 폭이 달라지면 줄이 들쭉날쭉해지고, 그림이
// 주인공인 첨부(사진·영상)에서 정작 그림이 가장 작은 자리를 차지한다. 정사각형은
// 그림을 가득 채우고, 이름은 아래쪽에 얇게 겹쳐 둔다.
//
// 두 종류가 한 줄에 선다(carouselItems).
//   파일   업로드·Drive — 파일마다 카드 하나
//   참조   GitHub·Local 프로젝트·URL — **덩어리마다** 카드 하나
// 참조가 덩어리로 서는 이유는 하나다. 저장소 주소 하나를 붙였을 뿐인데 파일 40개가
// 딸려 오고, 그걸 전부 카드로 눕히면 캐러셀이 남의 저장소로 덮인다. 이용자가 한 일은
// "주소 하나 붙이기"이므로 화면에도 하나로 보여야 한다. 눌러 보면 안에 든 파일을 넘겨 본다.
//
// 넘칠 때는 세 가지로 넘긴다 — 좌우 슬라이더 · 마우스 휠 · 트랙패드 스와이프.
// 세로 휠을 가로 스크롤로 바꿔 주지 않으면, 트랙패드가 없는 마우스 사용자는 넘친다는
// 사실조차 모르고 지나친다.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';
import {
  carouselItems,
  extLabel,
  formatBytes,
  thumbKindOf,
  type MentionGroup,
  type PendingAttachment,
  type SurfaceTone,
} from './pending-attachments';
import type { UploadTask } from './attachment-slots';
import AttachmentPreview from './attachment-preview';

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  drive: { label: 'Drive', className: 'bg-[#1a73e8]' },
  local: { label: '내 기기', className: 'bg-ink/75' },
};

/**
 * 정사각형 카드 한 변 — 8.1rem(≈130px).
 * 사진과 영상 첫 프레임을 "무엇인지 알아볼 수 있는" 크기로 만든다.
 */
const CARD_SIZE = 'relative block h-[8.1rem] w-[8.1rem] overflow-hidden rounded-[var(--radius-card)] border text-left';
/** 이름 띠 — 그림 위에 겹치므로 아래쪽만 어둡게 깔아 글자가 읽히게 한다. */
const CAPTION = 'absolute inset-x-0 bottom-0 truncate px-2 py-1.5 text-[11px] font-medium leading-tight text-white';
const SCRIM = 'absolute inset-x-0 bottom-0 h-11 bg-gradient-to-t from-ink/85 to-transparent';

/** 밝은 표면(검색바·컴포저)과 어두운 표면(에디터 챗)이 같은 위계를 갖도록 짝을 지어 둔다. */
const TONE: Record<SurfaceTone, { card: string; tile: string; tileText: string; chrome: string }> = {
  light: {
    card: 'border-hairline bg-paper',
    tile: 'bg-ink/[0.06]',
    tileText: 'text-fg-muted',
    chrome: 'border-hairline bg-surface text-fg-muted hover:text-signal',
  },
  dark: {
    card: 'border-white/10 bg-white/[0.06]',
    tile: 'bg-white/[0.06]',
    tileText: 'text-fg-on-dark-muted',
    chrome: 'border-white/15 bg-ink text-fg-on-dark-secondary hover:text-white',
  },
};

const SOURCE_ICON = 'h-7 w-7 fill-none stroke-current stroke-[1.5]';

/** 가져온 출처를 나타내는 그림 — 파일에는 썸네일이, 참조에는 이 아이콘이 선다. */
const SourceIcons: Record<string, React.ReactNode> = {
  github: (
    <svg viewBox="0 0 24 24" className={SOURCE_ICON} aria-hidden>
      <path
        d="M9 19c-4 1.2-4-2.3-5.6-2.8M15 21v-3.4c0-1 .1-1.4-.5-2 2.4-.3 4.6-1.2 4.6-5.2a4 4 0 0 0-1.1-2.8 3.7 3.7 0 0 0-.1-2.8s-.9-.3-3 1.1a10.2 10.2 0 0 0-5.4 0C7.4 4.5 6.5 4.8 6.5 4.8a3.7 3.7 0 0 0-.1 2.8A4 4 0 0 0 5.3 10.4c0 4 2.2 4.9 4.6 5.2-.6.6-.6 1.2-.5 2V21"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  project: (
    <svg viewBox="0 0 24 24" className={SOURCE_ICON} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" strokeLinejoin="round" />
    </svg>
  ),
  url: (
    <svg viewBox="0 0 24 24" className={SOURCE_ICON} aria-hidden>
      <path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.1 1.1" strokeLinecap="round" />
      <path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.1-1.1" strokeLinecap="round" />
    </svg>
  ),
};

function Badge({ source }: { source?: string }) {
  const badge = source ? SOURCE_BADGE[source] : undefined;
  if (!badge) return null;
  return (
    <span
      className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

/** 그림이 없는 첨부의 바탕 — 확장자를 크게 찍는다. */
function Tile({ name, tone }: { name: string; tone: SurfaceTone }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-0 grid place-items-center font-mono text-[20px] font-bold tracking-tight ${TONE[tone].tile} ${TONE[tone].tileText}`}
    >
      {extLabel(name)}
    </span>
  );
}

/**
 * 카드 안쪽 오른쪽 위에 붙는 × — 카드 밖으로 튀어나오지 않는다.
 *
 * 밖에 걸어 두면 카드 사이 간격을 잡아먹고, 캐러셀 첫 장·마지막 장에서는 트랙 경계에
 * 잘렸다. 안으로 들이면 그림 위에 놓이므로 어두운 원판을 깔아 대비를 만든다.
 */
function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { language } = useLanguage();
  return (
    <button
      type="button"
      onClick={(event) => {
        // 카드 전체가 미리보기 버튼이다 — 삭제가 미리보기를 함께 열지 않게 막는다
        event.stopPropagation();
        onRemove();
      }}
      aria-label={`${label} ${t('ai-attach-remove', language)}`}
      // 터치 기기에는 호버가 없다 — 좁은 화면에서는 항상 보이게 둔다
      className="absolute right-1 top-1 z-10 grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full bg-ink/65 text-white backdrop-blur-sm transition hover:bg-rose-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white sm:opacity-0 sm:group-hover/card:opacity-100 sm:group-focus-within/card:opacity-100"
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[2.6]" aria-hidden>
        <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/* ---------- 올라가는 중 ---------- */

/** 올리는 동안 자리를 지키는 카드 — 진행률 링과 취소 버튼을 함께 둔다. */
function TaskCard({ task, tone }: { task: UploadTask; tone: SurfaceTone }) {
  const percent = Math.round(task.progress * 100);
  const src = task.previewUrl ?? task.artUrl;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;

  return (
    <li className="group/card relative shrink-0">
      <div className={`${CARD_SIZE} ${TONE[tone].card}`} title={task.name}>
        {src ? (
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        ) : (
          <Tile name={task.name} tone={tone} />
        )}

        {/* 진행률 — 원둘레를 채워 나간다. 숫자만 두면 얼마나 남았는지 감이 오지 않는다. */}
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-ink/45">
          <span className="relative grid place-items-center">
            <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
              <circle cx="18" cy="18" r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke="white"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - task.progress)}
                className="transition-[stroke-dashoffset] duration-200"
              />
            </svg>
            <span className="absolute font-mono text-[13px] font-bold text-white">{percent}</span>
          </span>
        </span>

        <span aria-hidden className={SCRIM} />
        <span className={CAPTION}>{task.name.split('/').pop()}</span>
      </div>

      <RemoveButton label={task.name} onRemove={task.cancel} />
    </li>
  );
}

/* ---------- 파일 카드 ---------- */

function FileCard({
  file,
  tone,
  onRemove,
  onPreview,
}: {
  file: PendingAttachment;
  tone: SurfaceTone;
  onRemove?: () => void;
  onPreview: () => void;
}) {
  const { language } = useLanguage();
  const thumb = thumbKindOf(file);
  // 영상은 뽑아 둔 포스터가 있을 때만 그림을 낸다. file.url을 <img>에 넣으면 영상 바이트를
  // 이미지로 그리려다 실패해 '깨진 이미지'가 뜬다 — 그럴 바에는 확장자 타일이 낫다.
  const src =
    thumb === 'audio-art' ? file.artUrl : thumb === 'video' ? file.previewUrl : file.previewUrl || file.url;

  return (
    <li className="group/card relative shrink-0">
      <button
        type="button"
        onClick={onPreview}
        title={`${file.name}${file.size ? ` · ${formatBytes(file.size)}` : ''}`}
        aria-label={`${file.name} ${t('preview-open', language)}`}
        className={`${CARD_SIZE} ${TONE[tone].card} transition hover:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal`}
      >
        {thumb && src ? (
          <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Tile name={file.name} tone={tone} />
        )}

        {/* 영상은 재생 표시를 겹쳐 정지 이미지와 구분한다 — 포스터가 없어 타일일 때도 붙인다 */}
        {thumb === 'video' && (
          <span
            aria-hidden
            className={`absolute inset-0 grid place-items-center text-white ${src ? 'bg-ink/30' : 'bg-ink/10'}`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-ink/60">
              <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-px fill-current" aria-hidden>
                <path d="M8 5.5v13l11-6.5z" />
              </svg>
            </span>
          </span>
        )}
        {thumb === 'audio-art' && (
          <span
            aria-hidden
            className="absolute bottom-12 right-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink/75 text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-2" aria-hidden>
              <path d="M9 18V6l10-2v12" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="6.5" cy="18" r="2.5" />
              <circle cx="16.5" cy="16" r="2.5" />
            </svg>
          </span>
        )}

        <Badge source={file.source} />
        <span aria-hidden className={SCRIM} />
        <span className={CAPTION}>{file.name.split('/').pop()}</span>
      </button>

      {onRemove && <RemoveButton label={file.name} onRemove={onRemove} />}
    </li>
  );
}

/* ---------- 참조 카드 ---------- */

/**
 * 가져온 출처 하나 — 저장소 · 프로젝트 폴더 · 문서.
 *
 * 그림 대신 출처 아이콘과 이름을 싣는다. 저장소에는 대표 이미지가 없고, 아무 파일이나
 * 골라 썸네일로 쓰면 그 파일이 저장소를 대표하는 것처럼 읽히기 때문이다.
 */
function GroupCard({
  group,
  tone,
  onRemove,
  onPreview,
}: {
  group: MentionGroup;
  tone: SurfaceTone;
  onRemove?: () => void;
  onPreview: () => void;
}) {
  const { language } = useLanguage();
  const count = group.files.length;

  return (
    <li className="group/card relative shrink-0">
      <button
        type="button"
        onClick={onPreview}
        title={count > 1 ? `${group.label} · ${count}개 파일` : group.files[0].name}
        aria-label={`${group.label} ${t('preview-open', language)}`}
        className={`${CARD_SIZE} ${TONE[tone].card} ${TONE[tone].tile} transition hover:border-signal/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal`}
      >
        <span className={`absolute inset-x-0 top-0 grid h-[4.6rem] place-items-center ${TONE[tone].tileText}`}>
          {SourceIcons[group.source ?? 'url'] ?? SourceIcons.url}
        </span>

        {/* 파일 수 — 저장소가 몇 개짜리인지 눌러 보기 전에 알린다 */}
        {count > 1 && (
          <span
            className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold leading-none ${
              tone === 'dark' ? 'bg-white/15 text-white' : 'bg-ink/10 text-fg-secondary'
            }`}
          >
            {count}
          </span>
        )}

        {/* 참조는 이름이 전부다 — 파일 카드보다 두 줄까지 넉넉히 준다 */}
        <span
          className={`absolute inset-x-0 bottom-0 line-clamp-2 px-2 py-1.5 text-[11px] font-semibold leading-tight ${
            tone === 'dark' ? 'text-white' : 'text-fg'
          }`}
          style={{ wordBreak: 'keep-all' }}
        >
          {group.label}
        </span>
      </button>

      {onRemove && <RemoveButton label={group.label} onRemove={onRemove} />}
    </li>
  );
}

/* ---------- 슬라이더 ---------- */

function SliderButton({
  side,
  disabled,
  tone,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  tone: SurfaceTone;
  onClick: () => void;
}) {
  const { language } = useLanguage();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      aria-label={t(side === 'left' ? 'ai-attach-scroll-prev' : 'ai-attach-scroll-next', language)}
      className={`absolute ${
        side === 'left' ? 'left-0' : 'right-0'
      } top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border shadow-[0_1px_3px_rgba(8,9,26,0.12)] transition disabled:pointer-events-none disabled:opacity-0 ${TONE[tone].chrome}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[2.2]" aria-hidden>
        <path d={side === 'left' ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export default function AttachmentCarousel({
  files,
  tasks = [],
  onRemove,
  onRemoveGroup,
  tone = 'light',
  className = '',
}: {
  files: PendingAttachment[];
  /** 올라가는 중인 파일 — 목록 맨 앞에 선다 */
  tasks?: UploadTask[];
  onRemove?: (file: PendingAttachment) => void;
  /** 참조 덩어리를 통째로 지운다 — 저장소를 지우면 그 파일 전부가 빠진다 */
  onRemoveGroup?: (group: MentionGroup) => void;
  /** 어두운 표면(에디터 챗)에 놓일 때 */
  tone?: SurfaceTone;
  className?: string;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  // 미리보기는 "무엇을 넘겨 볼 것인가"까지 함께 연다 — 참조를 누르면 그 안의 파일만 넘긴다
  const [preview, setPreview] = useState<{ files: PendingAttachment[]; index: number } | null>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const items = carouselItems(files);
  const count = items.length + tasks.length;

  /** 양 끝에 닿았는지 — 슬라이더를 언제 감출지 정한다. */
  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setEdges({ start: track.scrollLeft <= 1, end: track.scrollLeft >= max - 1 });
  }, []);

  // 카드가 늘거나 줄면 넘침 여부가 바뀐다. 창 크기가 바뀔 때도 마찬가지다.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, [measure, count]);

  /**
   * 세로 휠을 가로 이동으로 바꾼다.
   *
   * React의 `onWheel`이 아니라 직접 붙이는 이유는 passive 때문이다. React가 붙이는 wheel
   * 리스너는 passive라 preventDefault가 먹지 않아, 캐러셀을 넘기면서 페이지도 함께
   * 스크롤된다.
   *
   * 끝에 닿으면 가로채지 않고 페이지에 넘긴다 — 캐러셀 위에서 휠이 죽은 것처럼
   * 느껴지지 않게.
   */
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    function onWheel(event: WheelEvent) {
      const el = trackRef.current;
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;

      // 트랙패드의 가로 스와이프는 브라우저가 이미 처리한다 — 세로 성분만 옮긴다
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? 0 : event.deltaY;
      if (delta === 0) return;

      const next = Math.min(max, Math.max(0, el.scrollLeft + delta));
      if (next === el.scrollLeft) return; // 이미 끝 — 페이지에 넘겨준다
      event.preventDefault();
      el.scrollLeft = next;
      measure();
    }

    track.addEventListener('wheel', onWheel, { passive: false });
    return () => track.removeEventListener('wheel', onWheel);
  }, [measure]);

  // 새로 붙인 파일은 오른쪽 끝에 들어온다 — 방금 붙인 것이 안 보이면 붙었는지 알 수 없다
  const previousCount = useRef(count);
  useEffect(() => {
    if (count > previousCount.current) {
      trackRef.current?.scrollTo({ left: trackRef.current.scrollWidth, behavior: 'smooth' });
    }
    previousCount.current = count;
  }, [count]);

  if (count === 0) return null;

  const slide = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    // 한 번에 트랙 폭의 80%씩 — 카드 한두 장 남짓
    track.scrollBy({ left: direction * Math.max(160, track.clientWidth * 0.8), behavior: 'smooth' });
  };

  /** 파일 카드를 눌렀을 때 — 같은 줄의 다른 파일들과 함께 넘겨 볼 수 있게 묶는다. */
  const openFile = (file: PendingAttachment) => {
    const siblings = items.flatMap((item) => (item.type === 'file' ? [item.file] : []));
    setPreview({ files: siblings, index: Math.max(0, siblings.indexOf(file)) });
  };

  return (
    <>
      <div className={`relative min-w-0 ${className}`}>
        <ul
          ref={trackRef}
          onScroll={measure}
          // dc-scroll — 얇은 스크롤바. 세로 여백 없이 가로로만 흐른다.
          className="dc-scroll flex w-full min-w-0 gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1.5 pt-1"
        >
          {/* 올라가는 중인 것이 먼저 — 방금 고른 파일이 목록 뒤에 숨지 않도록 */}
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} tone={tone} />
          ))}

          {items.map((item) =>
            item.type === 'file' ? (
              <FileCard
                key={item.key}
                file={item.file}
                tone={tone}
                onPreview={() => openFile(item.file)}
                onRemove={onRemove ? () => onRemove(item.file) : undefined}
              />
            ) : (
              <GroupCard
                key={item.key}
                group={item.group}
                tone={tone}
                // 참조를 누르면 그 안에 든 파일만 넘겨 본다
                onPreview={() => setPreview({ files: item.group.files, index: 0 })}
                onRemove={onRemoveGroup ? () => onRemoveGroup(item.group) : undefined}
              />
            ),
          )}
        </ul>

        {/* 넘칠 때만 나타난다 — 양 끝에 닿으면 그쪽 버튼이 사라진다 */}
        <SliderButton side="left" tone={tone} disabled={edges.start} onClick={() => slide(-1)} />
        <SliderButton side="right" tone={tone} disabled={edges.end} onClick={() => slide(1)} />
      </div>

      {preview && (
        <AttachmentPreview
          files={preview.files}
          index={preview.index}
          onIndexChange={(index) => setPreview((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
