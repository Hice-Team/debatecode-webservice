'use client';

// 팝업 작성·수정 — 왼쪽 폼, 오른쪽 실시간 미리보기.
//
// 미리보기를 붙인 이유: 포스터 이미지와 버튼이 생기면서 "올려 보고 확인"의 비용이 커졌다.
// 실제 팝업과 같은 모양을 옆에 띄워 두면 게시 전에 잘못을 잡을 수 있다.
import { useActionState, useState } from 'react';
import { savePopup, type PopupFormState } from '@/app/lib/actions/admin-popups';
import { POPUP_LINK_LABELS, POPUP_LINK_HINTS, DEFAULT_LINK_LABEL, type PopupLinkType } from '@/app/lib/popups';
import { FIELD, BTN_PRIMARY, BTN_NEUTRAL, Callout } from '../ui';

const initial: PopupFormState = {};

export interface PopupDraft {
  id: string;
  title: string;
  content: string;
  imageUrl: string | null;
  variant: string;
  linkType: string;
  linkTarget: string | null;
  linkLabel: string | null;
  order: number;
  startsAt: string | null;
  endsAt: string | null;
}

const LINK_TYPES: PopupLinkType[] = ['none', 'post', 'url', 'mail'];

const VARIANTS = [
  ['text', '텍스트형', '제목 + 본문 중심. 이미지는 상단 배너로 들어갑니다.'],
  ['poster', '포스터형', '이미지가 주인공. 본문 없이 이미지만으로도 올릴 수 있습니다.'],
] as const;

/** datetime-local 입력은 YYYY-MM-DDTHH:mm 형식만 받는다 */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PopupEditor({ draft, onDone }: { draft?: PopupDraft; onDone?: () => void }) {
  const [state, formAction, pending] = useActionState(savePopup, initial);

  const [title, setTitle] = useState(draft?.title ?? '');
  const [content, setContent] = useState(draft?.content ?? '');
  const [variant, setVariant] = useState<string>(draft?.variant ?? 'text');
  const [linkType, setLinkType] = useState<PopupLinkType>((draft?.linkType as PopupLinkType) ?? 'none');
  const [linkTarget, setLinkTarget] = useState(draft?.linkTarget ?? '');
  const [linkLabel, setLinkLabel] = useState(draft?.linkLabel ?? '');
  const [preview, setPreview] = useState<string | null>(draft?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);

  if (state.saved) {
    return (
      <Callout tone="ok" title="저장되었습니다">
        <button onClick={() => window.location.reload()} className="mt-2 block underline underline-offset-2">
          목록 새로고침
        </button>
      </Callout>
    );
  }

  const targetPlaceholder =
    linkType === 'post' ? '게시글 ID' : linkType === 'mail' ? 'support@example.com' : 'https://…';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <form action={formAction} className="space-y-4 rounded-[var(--radius-panel)] border border-hairline bg-white p-5">
        {draft && <input type="hidden" name="id" value={draft.id} />}
        <input type="hidden" name="existingImageUrl" value={draft?.imageUrl ?? ''} />

        <fieldset>
          <legend className="mb-1.5 font-mono text-xs tracking-wider text-fg-secondary">형식</legend>
          <div className="flex gap-2">
            {VARIANTS.map(([value, label, desc]) => (
              <label
                key={value}
                className={`flex flex-1 cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                  variant === value ? 'border-signal bg-brand-50/50' : 'border-hairline hover:border-ink/25'
                }`}
              >
                <input
                  type="radio"
                  name="variant"
                  value={value}
                  checked={variant === value}
                  onChange={() => setVariant(value)}
                  className="mt-0.5 h-4 w-4 accent-[#1800AC]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">{desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="pop-title" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            제목
          </label>
          <input
            id="pop-title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 디베이트메이트 2기 모집"
            className={FIELD}
          />
          {state.errors?.title && <p className="mt-1 text-xs text-rose-600">{state.errors.title[0]}</p>}
        </div>

        <div>
          <label htmlFor="pop-content" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            내용 {variant === 'poster' && <span className="text-fg-quiet">(포스터형은 선택)</span>}
          </label>
          <textarea
            id="pop-content"
            name="content"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={FIELD}
          />
          {state.errors?.content && <p className="mt-1 text-xs text-rose-600">{state.errors.content[0]}</p>}
        </div>

        <div>
          <label htmlFor="pop-image" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
            포스터 이미지 (선택 · 5MB 이하)
          </label>
          <input
            id="pop-image"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPreview(f ? URL.createObjectURL(f) : (draft?.imageUrl ?? null));
              setRemoveImage(false);
            }}
            className="w-full text-xs text-fg-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
          />
          {draft?.imageUrl && (
            <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[11px] text-fg-secondary">
              <input
                type="checkbox"
                name="removeImage"
                checked={removeImage}
                onChange={(e) => {
                  setRemoveImage(e.target.checked);
                  if (e.target.checked) setPreview(null);
                }}
                className="h-3.5 w-3.5 accent-[#1800AC]"
              />
              기존 이미지 제거
            </label>
          )}
        </div>

        <fieldset className="rounded-xl border border-hairline bg-paper/30 p-3.5">
          <legend className="px-1 font-mono text-xs tracking-wider text-fg-secondary">클릭 동작</legend>
          <select
            name="linkType"
            aria-label="클릭 동작"
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as PopupLinkType)}
            className={FIELD}
          >
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {POPUP_LINK_LABELS[t]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-fg-muted">{POPUP_LINK_HINTS[linkType]}</p>

          {linkType !== 'none' && (
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <input
                name="linkTarget"
                aria-label="링크 대상"
                value={linkTarget}
                onChange={(e) => setLinkTarget(e.target.value)}
                placeholder={targetPlaceholder}
                className={FIELD}
              />
              <input
                name="linkLabel"
                aria-label="버튼 문구"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder={`버튼 문구 (기본: ${DEFAULT_LINK_LABEL[linkType]})`}
                className={FIELD}
              />
            </div>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pop-start" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              시작 (선택)
            </label>
            <input
              id="pop-start"
              name="startsAt"
              type="datetime-local"
              defaultValue={toLocalInput(draft?.startsAt ?? null)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="pop-end" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              종료 (선택)
            </label>
            <input
              id="pop-end"
              name="endsAt"
              type="datetime-local"
              defaultValue={toLocalInput(draft?.endsAt ?? null)}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="pop-order" className="mb-1.5 block font-mono text-xs tracking-wider text-fg-secondary">
              순서
            </label>
            <input id="pop-order" name="order" type="number" min={0} max={999} defaultValue={draft?.order ?? 0} className={FIELD} />
          </div>
        </div>

        {state.errors?.form && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {state.errors.form[0]}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className={BTN_PRIMARY}>
            {pending ? '저장 중…' : draft ? '수정 저장' : '팝업 게시'}
          </button>
          {onDone && (
            <button type="button" onClick={onDone} className={BTN_NEUTRAL}>
              취소
            </button>
          )}
        </div>
      </form>

      {/* 미리보기 — 실제 팝업과 같은 배치 */}
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted">방문자에게 보이는 모습</p>
        <div className="overflow-hidden rounded-[var(--radius-panel)] border border-ink/15 bg-white shadow-sm">
          {preview && (
             
            <img
              src={preview}
              alt=""
              className={variant === 'poster' ? 'max-h-64 w-full bg-ink/[0.03] object-contain' : 'h-28 w-full object-cover'}
            />
          )}
          {variant !== 'poster' && (
            <div className="bg-brand-900 px-5 py-3.5 text-white">
              <p className="font-mono text-[10px] tracking-wider text-brand-300">NOTICE</p>
              <p className="mt-0.5 text-base font-bold leading-snug">{title || '(제목)'}</p>
            </div>
          )}
          <div className="px-5 py-4">
            {variant === 'poster' && <p className="mb-1.5 text-base font-bold text-ink">{title || '(제목)'}</p>}
            <p className="whitespace-pre-line text-xs leading-relaxed text-fg">
              {content || (variant === 'poster' ? '' : '(내용)')}
            </p>
          </div>
          <div className="flex items-center gap-2 border-t border-hairline bg-paper/60 px-5 py-3">
            <span className="text-[11px] text-fg-muted">오늘 하루 보지 않기</span>
            <span className="ml-auto flex gap-1.5">
              {linkType !== 'none' && linkTarget && (
                <span className="rounded-lg border border-brand-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand-700">
                  {linkLabel || DEFAULT_LINK_LABEL[linkType]}
                </span>
              )}
              <span className="rounded-lg bg-brand-600 px-3 py-1.5 text-[11px] font-semibold text-white">닫기</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
