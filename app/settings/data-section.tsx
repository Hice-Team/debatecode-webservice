'use client';

// 데이터 · 약관 섹션 — 내 데이터를 직접 정리하고, 적용받는 문서를 한곳에서 확인한다.
// 개인정보처리방침의 "이용자의 권리"를 화면에서 바로 행사할 수 있게 하는 자리다.
import { useState, useTransition, useActionState } from 'react';
import Link from 'next/link';
import { deleteAllAiSessions } from '@/app/lib/actions/ai-search-transfer';
import { deleteSelectedUserData, type DeleteDataState } from '@/app/lib/actions/settings';

const DOCS = [
  { href: '/legal/terms', label: '서비스 이용약관', desc: '서비스 이용 조건과 풀이 모드·AI 기능 고지' },
  { href: '/legal/ai-terms', label: 'debateAI 이용약관', desc: '학습 활용 동의, 데이터 수집, AI 결과에 대한 책임' },
  { href: '/legal/privacy', label: '개인정보처리방침', desc: '수집 항목, 보관 기간, 국외 이전, 이용자의 권리' },
  { href: '/legal/consent', label: '개인정보 수집·이용 동의', desc: '필수·선택 항목 구분과 동의 거부 시 안내' },
  { href: '/legal/mate-terms', label: '디베이트메이트 활동 약관', desc: '저작권·포인트 지급 기준·디베이트샵 교환 규정' },
];

export default function DataSection({ aiSessionCount }: { aiSessionCount: number }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [actionState, action, deleting] = useActionState<DeleteDataState, FormData>(deleteSelectedUserData, {});
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function clearAiSessions() {
    if (!window.confirm('AI Search 대화를 모두 삭제할까요? 삭제한 대화는 복구할 수 없습니다.')) return;
    startTransition(async () => {
      await deleteAllAiSessions();
      setDone(true);
    });
  }

  function toggleType(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submitDelete(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) return;
    const fd = new FormData();
    for (const v of selected) fd.append('types', v);
    await (action as unknown as (fd: FormData) => Promise<unknown>)(fd as unknown as FormData);
    setShowModal(false);
    setSelected(new Set());
    setDone(true);
  }

  return (
    <section id="data" aria-labelledby="data-title" className="scroll-mt-24">
      <div className="mb-3">
        <h2 id="data-title" className="mt-1 text-xl font-bold text-ink">
          데이터 · 약관
        </h2>
        <p className="mt-1 text-sm text-ink-soft/60">내 데이터를 정리하고, 적용받는 약관과 방침을 확인합니다.</p>
      </div>

      {/* AI Search 대화 정리 */}
      <div className="rounded-xl border border-ink/10 bg-white p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">AI Search 대화</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-soft/55">
              최근 1개 세션만 보관됩니다. 보존하려면 대화 화면에서 먼저 내보내기로 JSON 파일을 내려받으세요.
            </p>
          </div>
          <button
            type="button"
            onClick={clearAiSessions}
            disabled={pending || aiSessionCount === 0}
            className="shrink-0 rounded-lg border border-ink/15 px-3.5 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {pending ? '삭제 중…' : '대화 전체 삭제'}
          </button>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="shrink-0 rounded-lg border border-ink/15 px-3.5 py-2 text-xs font-semibold text-ink-soft/70 transition hover:border-ink/40 hover:bg-paper/50"
          >
            서비스 이용 데이터 제거
          </button>
        </div>
        <p className="mt-2 font-mono text-[11px] text-ink-soft/40">
          {done ? '삭제했습니다.' : `보관 중인 세션 ${aiSessionCount}개`}
        </p>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={submitDelete} className="w-full max-w-lg rounded-xl bg-white p-6">
            <h3 className="text-lg font-semibold">서비스 이용 데이터 제거</h3>
            <p className="mt-2 text-sm text-ink-soft/60">제거할 데이터 종류를 선택하세요. 삭제한 데이터는 복구할 수 없습니다.</p>
            <div className="mt-4 grid gap-3">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('activityLogs')} onChange={() => toggleType('activityLogs')} />
                <span className="flex-1">활동기록 (실행/시도 기록)</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('submissions')} onChange={() => toggleType('submissions')} />
                <span className="flex-1">문제 풀이 (제출 기록)</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('posts')} onChange={() => toggleType('posts')} />
                <span className="flex-1">게시글</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('comments')} onChange={() => toggleType('comments')} />
                <span className="flex-1">커뮤니티 답글</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('aiSessions')} onChange={() => toggleType('aiSessions')} />
                <span className="flex-1">AI Search 대화</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('debateChats')} onChange={() => toggleType('debateChats')} />
                <span className="flex-1">debateAI 채팅</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('bookmarks')} onChange={() => toggleType('bookmarks')} />
                <span className="flex-1">북마크</span>
              </label>
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={selected.has('cache')} onChange={() => toggleType('cache')} />
                <span className="flex-1">캐시/클라이언트 데이터 (브라우저)</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg px-4 py-2 border">취소</button>
              <button type="submit" disabled={selected.size === 0 || deleting} className="rounded-lg bg-rose-600 px-4 py-2 text-white">
                {deleting ? '삭제 중…' : '선택 항목 삭제'}
              </button>
            </div>
            {actionState.sent && actionState.error && <p className="mt-3 text-sm text-rose-600">{actionState.error}</p>}
          </form>
        </div>
      )}

      {/* 약관·방침 */}
      <ul className="mt-3 divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10 bg-white">
        {DOCS.map((doc) => (
          <li key={doc.href}>
            <Link href={doc.href} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-brand-50/40">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{doc.label}</span>
                <span className="mt-0.5 block text-xs text-ink-soft/50">{doc.desc}</span>
              </span>
              <span aria-hidden className="shrink-0 text-ink-soft/30">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
