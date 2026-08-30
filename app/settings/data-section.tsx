'use client';

// 데이터 제어 — 내 데이터를 내려받고, 지우고, 어디에 쓰이는지 정한다.
//
// 개인정보처리방침에 적힌 "이용자의 권리"(열람·전송요구·삭제·동의 철회)를 문장이 아니라
// 버튼으로 둔 자리다. 권리를 적어 두고 행사할 방법을 두지 않으면 적어 두지 않은 것과 같다.
//
// 네 갈래로 나눈다.
//   ① 내보내기   — 가져가는 것
//   ② 학습 활용  — 동의를 켜고 끄는 것
//   ③ 계정 기록  — 서버에서 지우는 것 (다른 기기에도 반영된다)
//   ④ 이 기기    — 브라우저에서 지우는 것 (이 기기에만 반영된다)
// ③과 ④를 한 버튼으로 묶지 않는 이유는, 지워지는 범위가 서로 다르기 때문이다.
import { useActionState, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  deleteSelectedUserData,
  setAiTrainingConsent,
  type DeleteDataState,
} from '@/app/lib/actions/settings';
import { CACHE_GROUPS, clearLocalCache, countLocalCache, type CacheKind } from '@/app/lib/local-cache';
import Dialog from '@/app/components/dialog';
import Toast from '@/app/components/toast';
import Toggle from '@/app/components/toggle';

const DOCS = [
  { href: '/legal/terms', label: '서비스 이용약관', desc: '서비스 이용 조건과 풀이 모드·AI 기능 고지' },
  { href: '/legal/ai-terms', label: 'debateAI 이용약관', desc: '학습 활용 동의, 데이터 수집, AI 결과에 대한 책임' },
  { href: '/legal/privacy', label: '개인정보처리방침', desc: '수집 항목, 보관 기간, 국외 이전, 이용자의 권리' },
  { href: '/legal/consent', label: '개인정보 수집·이용 동의', desc: '필수·선택 항목 구분과 동의 거부 시 안내' },
  { href: '/legal/mate-terms', label: '디베이트메이트 활동 약관', desc: '저작권·활동 범위·게시판 운영 규칙' },
  { href: '/legal/point-terms', label: '디베이트포인트 약관', desc: '지급 기준, 사용 방식, 메이트 추가 지급 정책, 부정 적립 회수' },
];

export interface DataCounts {
  activityLogs: number;
  submissions: number;
  posts: number;
  comments: number;
  aiSessions: number;
  debateChats: number;
  bookmarks: number;
}

/** 지울 수 있는 계정 기록 — 라벨과 "지우면 무엇이 사라지는지" */
const DELETABLE: { key: keyof DataCounts; label: string; note: string }[] = [
  { key: 'activityLogs', label: '실행 기록', note: '문제를 실행해 본 이력. 지워도 제출은 남습니다.' },
  { key: 'submissions', label: '제출 기록', note: '제출한 코드와 채점 결과. 통과 이력과 랭킹 근거가 사라집니다.' },
  { key: 'posts', label: '내가 쓴 글', note: '글에 달린 답글도 함께 사라집니다.' },
  { key: 'comments', label: '내가 쓴 답글', note: '채택된 답글이면 채택 표시도 사라집니다.' },
  { key: 'aiSessions', label: 'AI Search 대화', note: '주고받은 질문과 답변 전체.' },
  { key: 'debateChats', label: 'debateAI 채팅', note: '문제별로 나눈 대화.' },
  { key: 'bookmarks', label: '북마크', note: '담아 둔 문제 목록.' },
];

const ROW = 'border-b border-hairline py-5 last:border-b-0';
const CONFIRM_WORD = '삭제';

export default function DataSection({
  counts,
  trainingConsent,
}: {
  counts: DataCounts;
  trainingConsent: boolean;
}) {
  const [deleteState, deleteAction, deleting] = useActionState<DeleteDataState, FormData>(
    deleteSelectedUserData,
    {},
  );
  const [consentPending, startConsent] = useTransition();
  const [consent, setConsent] = useState(trainingConsent);
  const [toast, setToast] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [picked, setPicked] = useState<Set<keyof DataCounts>>(new Set());
  const [confirmText, setConfirmText] = useState('');

  const [cacheOpen, setCacheOpen] = useState(false);
  const [cacheCounts, setCacheCounts] = useState<Record<CacheKind, number> | null>(null);
  const [cachePicked, setCachePicked] = useState<Set<CacheKind>>(
    new Set<CacheKind>(['drafts', 'translations', 'dismissed']),
  );

  // 토스트는 잠깐만 떠 있는다 — 남겨 두면 다음 조작의 결과와 헷갈린다
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // 삭제가 끝나면 확인창을 닫고 결과를 알린다.
  //
  // effect가 아니라 렌더 중에 정리한다. effect로 두면 "지워진 목록"이 한 번 그려진 뒤
  // 확인창이 닫히면서 화면이 덜컥인다. 처리한 결과는 객체 신원으로 기억한다 —
  // 같은 내용({sent:true})이 다시 와도 새 객체이므로 다음 삭제와 헷갈리지 않는다.
  const [handledDelete, setHandledDelete] = useState<DeleteDataState | null>(null);
  if (deleteState.sent && !deleting && handledDelete !== deleteState) {
    setHandledDelete(deleteState);
    setDeleteOpen(false);
    setPicked(new Set());
    setConfirmText('');
    setToast(deleteState.error ?? '선택한 기록을 지웠습니다.');
  }

  function openCache() {
    setCacheCounts(countLocalCache());
    setCacheOpen(true);
  }

  function runCacheClear() {
    const removed = clearLocalCache([...cachePicked]);
    const resetDisplay = cachePicked.has('display');
    setCacheOpen(false);
    setToast(removed === 0 ? '지울 항목이 없었습니다.' : `이 기기에서 ${removed}개 항목을 지웠습니다.`);
    if (resetDisplay) {
      // 테마·고대비 표식이 <html>에 남아 있어 새로 불러와야 기본값으로 돌아간다
      setTimeout(() => window.location.reload(), 700);
    }
  }

  const totalPicked = [...picked].reduce((sum, k) => sum + counts[k], 0);

  return (
    <section aria-labelledby="data-title">
      <h2 id="data-title" className="sr-only">
        데이터 제어
      </h2>

      {/* ① 내보내기 ------------------------------------------------------- */}
      <div className={ROW}>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">내 데이터 전체 내보내기</p>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
              프로필, 제출·실행 기록, 글과 답글, AI 대화, 포인트 내역, 로그인 기록을 JSON 한 파일로
              내려받습니다. 목록별 최근 2,000건까지 담기며, API 키처럼 다시 보여 줄 수 없는 값은 담기지
              않습니다.
            </p>
          </div>
          <a
            href="/settings/data/export"
            download
            className="dc-tap inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-[1.7]" aria-hidden>
              <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" strokeLinecap="round" />
            </svg>
            JSON으로 내려받기
          </a>
        </div>
        <p className="mt-2 font-mono text-[11px] text-fg-quiet">1시간에 3번까지 내려받을 수 있습니다.</p>
      </div>

      {/* ② 학습 활용 동의 -------------------------------------------------- */}
      <div className={ROW}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">AI 모델 개선에 내 대화 활용</p>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
              선택 사항입니다. 켜면 대화와 코드가 가명처리된 뒤 모델 개선에 쓰입니다. 끄더라도 AI 기능은
              그대로 쓸 수 있고, 언제든 다시 바꿀 수 있습니다.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {consentPending && <span className="font-mono text-[11px] text-fg-quiet">저장 중…</span>}
            <Toggle
              label="AI 모델 개선에 내 대화 활용"
              checked={consent}
              disabled={consentPending}
              onChange={(next) => {
                setConsent(next);
                const fd = new FormData();
                fd.set('consent', next ? 'on' : 'off');
                startConsent(async () => {
                  await setAiTrainingConsent(fd);
                  setToast(next ? '학습 활용에 동의했습니다.' : '학습 활용 동의를 철회했습니다.');
                });
              }}
            />
          </div>
        </div>
      </div>

      {/* ③ 계정 기록 ------------------------------------------------------- */}
      <div className={ROW}>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">계정에 쌓인 기록</p>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
              지금 서버에 남아 있는 기록입니다. 지우면 모든 기기에서 사라지고 되돌릴 수 없습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            골라서 지우기
          </button>
        </div>

        {/* 개수를 먼저 보여 준다 — 무엇이 얼마나 있는지 모르고 지우게 두지 않는다 */}
        <dl className="mt-4 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {DELETABLE.map((d) => (
            <div key={d.key} className="flex items-baseline justify-between gap-2 border-b border-hairline py-1.5">
              <dt className="truncate text-[13px] text-fg-secondary">{d.label}</dt>
              <dd className="shrink-0 font-mono text-[13px] tabular-nums text-fg">
                {counts[d.key].toLocaleString('ko-KR')}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ④ 이 기기 --------------------------------------------------------- */}
      <div className={ROW}>
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">이 기기에 남은 데이터</p>
            <p className="mt-1 max-w-prose text-[13px] leading-relaxed text-fg-muted">
              작성 중이던 글과 코드, 번역 캐시, 닫아 둔 안내 기록이 이 브라우저에 저장돼 있습니다. 지워도
              계정 기록과 로그인 상태에는 영향이 없습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={openCache}
            className="dc-tap min-h-10 shrink-0 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-semibold text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            캐시 정리
          </button>
        </div>
      </div>

      {/* 약관·방침 --------------------------------------------------------- */}
      <div className="pt-6">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-fg-quiet">적용받는 문서</p>
        <ul className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-surface">
          {DOCS.map((doc) => (
            <li key={doc.href}>
              <Link
                href={doc.href}
                className="flex min-h-[52px] items-center gap-3 px-5 py-3 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fg">{doc.label}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-muted">{doc.desc}</span>
                </span>
                <span aria-hidden className="shrink-0 text-fg-quiet">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* ---------- 계정 기록 삭제 확인창 ---------- */}
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        tone="danger"
        title="계정 기록 지우기"
        desc="지운 기록은 복구할 수 없습니다. 필요하다면 먼저 내보내기로 내려받아 두세요."
      >
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (picked.size === 0 || confirmText.trim() !== CONFIRM_WORD) e.preventDefault();
          }}
        >
          <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
            {DELETABLE.map((d) => {
              const empty = counts[d.key] === 0;
              return (
                <li key={d.key}>
                  <label
                    className={`flex min-h-[52px] items-start gap-3 px-3.5 py-3 ${
                      empty ? 'opacity-50' : 'cursor-pointer hover:bg-paper'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="types"
                      value={d.key}
                      disabled={empty}
                      checked={picked.has(d.key)}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.key);
                          else next.delete(d.key);
                          return next;
                        })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-hairline accent-[#4531d9]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-sm font-medium text-fg">{d.label}</span>
                        <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                          {empty ? '없음' : `${counts[d.key].toLocaleString('ko-KR')}건`}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{d.note}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {/* 되돌릴 수 없는 조작이라 한 번 더 손을 거치게 한다 */}
          <label className="mt-4 block">
            <span className="text-[13px] text-fg-secondary">
              확인을 위해 <strong className="font-mono text-fg">{CONFIRM_WORD}</strong> 를 입력해 주세요.
            </span>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
              className="mt-1.5 w-full rounded-[var(--radius-card)] border border-hairline bg-surface px-3 py-2 text-sm text-fg focus:border-signal focus:outline-none focus:ring-2 focus:ring-signal/20"
            />
          </label>

          {deleteState.error && <p className="mt-3 text-[13px] text-rose-600">{deleteState.error}</p>}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              className="dc-tap min-h-10 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={picked.size === 0 || confirmText.trim() !== CONFIRM_WORD || deleting}
              className="dc-tap min-h-10 rounded-[var(--radius-card)] bg-rose-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-40 disabled:hover:bg-rose-600"
            >
              {deleting ? '지우는 중…' : totalPicked > 0 ? `${totalPicked.toLocaleString('ko-KR')}건 지우기` : '지우기'}
            </button>
          </div>
        </form>
      </Dialog>

      {/* ---------- 이 기기 캐시 정리 확인창 ---------- */}
      <Dialog
        open={cacheOpen}
        onClose={() => setCacheOpen(false)}
        title="이 기기 캐시 정리"
        desc="이 브라우저에만 적용됩니다. 계정 기록과 로그인 상태는 그대로입니다."
      >
        <ul className="divide-y divide-hairline rounded-[var(--radius-card)] border border-hairline">
          {CACHE_GROUPS.map((g) => {
            const n = cacheCounts?.[g.kind] ?? 0;
            return (
              <li key={g.kind}>
                <label className="flex min-h-[52px] cursor-pointer items-start gap-3 px-3.5 py-3 hover:bg-paper">
                  <input
                    type="checkbox"
                    checked={cachePicked.has(g.kind)}
                    onChange={(e) =>
                      setCachePicked((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(g.kind);
                        else next.delete(g.kind);
                        return next;
                      })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-hairline accent-[#4531d9]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-fg">{g.label}</span>
                      <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                        {n === 0 ? '없음' : `${n}개`}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-fg-muted">{g.desc}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        {cachePicked.has('display') && (
          <p className="mt-3 text-[12px] leading-relaxed text-amber-700">
            화면 설정을 지우면 테마·고대비·낭독 속도가 기본값으로 돌아가며, 반영을 위해 화면을 새로
            불러옵니다.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setCacheOpen(false)}
            className="dc-tap min-h-10 rounded-[var(--radius-card)] border border-hairline px-4 text-sm font-medium text-fg-secondary transition-colors hover:border-fg-quiet hover:text-fg"
          >
            취소
          </button>
          <button
            type="button"
            onClick={runCacheClear}
            disabled={cachePicked.size === 0}
            className="dc-tap min-h-10 rounded-[var(--radius-card)] bg-signal px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            정리하기
          </button>
        </div>
      </Dialog>

      <Toast open={!!toast}>
        <span className="text-sm text-fg">{toast}</span>
      </Toast>
    </section>
  );
}
