'use client';

// 팝업 목록 — LIVE 상태·기간·클릭 동작을 한 줄에서 읽고, 인라인으로 수정한다.
//
// 여러 개가 동시에 뜰 수 있게 되면서 "지금 방문자가 몇 개를 보게 되는가"가 중요해졌다.
// 그래서 활성 여부만이 아니라 게시 기간까지 반영한 실제 노출 상태를 표시한다.
import { useState } from 'react';
import { togglePopup, deletePopup } from '@/app/lib/actions/admin-popups';
import { POPUP_LINK_LABELS, type PopupLinkType } from '@/app/lib/popups';
import PopupEditor, { type PopupDraft } from './popup-editor';
import { EmptyState, BTN_NEUTRAL } from '../ui';

export interface PopupRow extends PopupDraft {
  active: boolean;
  createdAt: string;
  /** 서버가 계산한 현재 노출 여부 (활성 + 기간) */
  live: boolean;
  /** 노출되지 않는 이유 — 운영자가 바로 알 수 있게 */
  reason: string | null;
}

export default function PopupList({ items }: { items: PopupRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-hairline bg-white">
        <EmptyState title="등록된 팝업이 없습니다" sub="위에서 첫 팝업을 만들어 보세요." />
      </div>
    );
  }

  return (
    <div className="divide-y divide-ink/5 overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-white">
      {items.map((item) =>
        editingId === item.id ? (
          <div key={item.id} className="p-5">
            <PopupEditor draft={item} onDone={() => setEditingId(null)} />
          </div>
        ) : (
          <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <span
              className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                item.live
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : item.active
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-hairline bg-paper text-fg-muted'
              }`}
            >
              {item.live ? 'LIVE' : item.active ? '대기' : 'OFF'}
            </span>

            {item.imageUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={item.imageUrl} alt="" className="h-9 w-14 shrink-0 rounded object-cover ring-1 ring-ink/10" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{item.title}</p>
              <p className="font-mono text-[10px] text-fg-muted">
                #{item.order} · {item.variant === 'poster' ? '포스터형' : '텍스트형'}
                {item.linkType !== 'none' && ` · ${POPUP_LINK_LABELS[item.linkType as PopupLinkType]}`}
                {item.reason && <span className="text-amber-700"> · {item.reason}</span>}
              </p>
            </div>

            <span className="shrink-0 font-mono text-[11px] text-fg-quiet">
              {new Date(item.createdAt).toLocaleDateString('ko-KR')}
            </span>

            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={() => setEditingId(item.id)} className={BTN_NEUTRAL}>
                수정
              </button>
              <form action={togglePopup}>
                <input type="hidden" name="id" value={item.id} />
                <button className={BTN_NEUTRAL}>{item.active ? '내리기' : '올리기'}</button>
              </form>
              <form action={deletePopup}>
                <input type="hidden" name="id" value={item.id} />
                <button className="rounded-xl border border-ink/15 px-3 py-1.5 text-xs font-medium text-fg-secondary hover:border-rose-300 hover:text-rose-700">
                  삭제
                </button>
              </form>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
