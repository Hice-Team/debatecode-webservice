'use client';

// 문제집 담기 — 별 아이콘을 누르면 문제집 목록 모달이 열린다.
// 각 문제집은 담김/안담김 상태를 그대로 보여주고, 누르면 그 문제집 기준으로 토글된다.
// (담긴 문제집을 다시 누르면 제거, 다른 문제집을 누르면 그쪽에도 추가 — 여러 곳에 동시 저장 가능)
import { useState, useTransition } from 'react';
import { createWorkbook, removeFromWorkbook, saveToWorkbook } from '@/app/lib/actions/bookmarks';

type Workbook = { id: string; name: string; isDefault: boolean; saved: boolean };

export default function WorkbookBookmark({
  problemId,
  workbooks,
  isSaved = false,
}: {
  problemId: number;
  workbooks: Workbook[];
  isSaved?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  // 방금 수행한 동작을 모달 안에서 잠깐 알려준다
  const [flash, setFlash] = useState<{ kind: 'added' | 'removed'; book: string } | null>(null);

  const toggle = (book: Workbook) =>
    startTransition(async () => {
      if (book.saved) {
        await removeFromWorkbook(book.id, problemId);
        setFlash({ kind: 'removed', book: book.name });
      } else {
        await saveToWorkbook(book.id, problemId);
        setFlash({ kind: 'added', book: book.name });
      }
    });

  const create = () =>
    startTransition(async () => {
      await createWorkbook(name);
      setName('');
      setCreating(false);
    });

  const savedCount = workbooks.filter((book) => book.saved).length;

  return (
    <>
      <button
        type="button"
        onClick={() => { setFlash(null); setOpen(true); }}
        title={isSaved ? '담긴 문제집 관리' : '문제집에 저장'}
        aria-label={isSaved ? '담긴 문제집 관리' : '문제집에 저장'}
        className={`transition-colors hover:text-signal ${isSaved ? 'text-signal' : 'text-fg-quiet'}`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 stroke-current ${isSaved ? 'fill-current stroke-[1.1]' : 'fill-none stroke-[1.25]'}`}
          aria-hidden
        >
          <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="workbook-modal-title">
          <button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="absolute inset-0 bg-ink/35 backdrop-blur-sm" />

          <section className="relative z-10 w-full max-w-sm rounded-[var(--radius-panel)] border border-hairline bg-white p-5 shadow-2xl shadow-ink/25">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold tracking-wider text-signal">MY WORKBOOK</p>
                <h2 id="workbook-modal-title" className="mt-1 text-lg font-bold text-ink">
                  문제집에 저장
                </h2>
                <p className="mt-1 text-sm text-fg-muted">
                  {savedCount > 0
                    ? `${savedCount}개 문제집에 담겨 있어요. 다시 누르면 빼고, 다른 문제집을 누르면 함께 담깁니다.`
                    : '저장할 문제집을 선택해 주세요. 여러 문제집에 함께 담을 수 있어요.'}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-fg-muted hover:bg-ink/5" aria-label="닫기">
                ×
              </button>
            </div>

            {flash && (
              <p
                role="status"
                className={`mb-3 rounded-lg px-3 py-2 text-xs font-medium ${
                  flash.kind === 'added' ? 'bg-brand-50 text-brand-700' : 'bg-ink/[0.05] text-fg-secondary'
                }`}
              >
                {flash.kind === 'added' ? `‘${flash.book}’에 담았습니다.` : `‘${flash.book}’에서 뺐습니다.`}
              </p>
            )}

            <div className="space-y-1">
              {workbooks.map((book) => (
                <button
                  key={book.id}
                  type="button"
                  disabled={pending}
                  onClick={() => toggle(book)}
                  aria-pressed={book.saved}
                  title={book.saved ? '다시 누르면 이 문제집에서 빠집니다' : '이 문제집에 담기'}
                  className={`group flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-3 text-left text-sm transition disabled:opacity-50 ${
                    book.saved
                      ? 'border-brand-300 bg-brand-50/70 hover:border-rose-300 hover:bg-rose-50/70'
                      : 'border-transparent hover:border-brand-200 hover:bg-brand-50'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                        book.saved ? 'bg-signal text-white' : 'border border-ink/15 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className={`truncate font-medium ${book.saved ? 'text-brand-800' : 'text-ink'}`}>{book.name}</span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5">
                    {book.isDefault && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-signal">기본</span>
                    )}
                    {book.saved && (
                      <>
                        {/* 평소엔 '저장됨', 호버하면 '빼기'로 바뀌어 재클릭 결과를 미리 알린다 */}
                        <span className="rounded-full bg-signal px-2 py-0.5 text-[10px] font-semibold text-white group-hover:hidden">
                          저장됨
                        </span>
                        <span className="hidden rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-semibold text-white group-hover:inline">
                          빼기
                        </span>
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>

            {creating ? (
              <form action={() => create()} className="mt-3 flex gap-2 border-t border-hairline pt-3">
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-ink/15 px-3 py-2 text-sm focus:border-signal focus:outline-none"
                  placeholder="새 문제집 이름"
                />
                <button disabled={pending} className="rounded-lg bg-signal px-3 text-sm font-semibold text-white disabled:opacity-50">
                  추가
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-3 w-full rounded-xl border border-dashed border-signal/35 px-3 py-2.5 text-sm font-semibold text-signal hover:bg-brand-50"
              >
                + 새 문제집 만들기
              </button>
            )}
          </section>
        </div>
      )}
    </>
  );
}
