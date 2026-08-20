'use client';

// debateAI 답변 툴바 — [👍] [👎] [새로고침] [복사] [⋮]
//
// AI Search의 응답 툴바와 같은 구성이다. 다만 어두운 패널에 얹히고, 답변이 DB의
// AiMessage가 아니라 대화 JSON이라 서버 메시지 id가 필요한 두 항목은 빠진다.
//   빠짐: "새 채팅에서 브랜치 생성"(AI Search 세션 전용), "법적 문제 신고"(신고 대상 id 필요)
// 남는 항목은 이 답변 하나에만 적용되는 동작이다.
import { useEffect, useRef, useState } from 'react';
import { useSpeech } from '@/app/lib/speech';
import SpeechPlayer from '@/app/components/speech-player';
import { EFFORT_HINTS, EFFORT_LABELS, asEffort } from '@/app/lib/ai/effort';
import { findDebateAiModel } from '@/app/lib/ai/debateai-models';

export interface AnswerUsage {
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** 공급자가 usage를 주지 않아 추정한 값인지 */
  estimated?: boolean;
  effort?: string | null;
  /** 실제로 호출된 모델 경로 */
  repo?: string | null;
  /** 고른 모델이 막혀 대체 모델로 답했는지 */
  replaced?: boolean;
}

const ICON = 'h-4 w-4 fill-none stroke-current stroke-[1.6]';

export default function AnswerToolbar({
  content,
  modelId,
  usage,
  query,
  createdAt,
  onRegenerate,
  busy,
}: {
  content: string;
  modelId: string;
  usage?: AnswerUsage;
  /** 구글 검색에 넘길 질의 — 이 답변을 부른 질문 */
  query: string;
  createdAt?: number;
  onRegenerate?: () => void;
  busy?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const speech = useSpeech('ko');
  const menuRef = useRef<HTMLDivElement>(null);

  const model = findDebateAiModel(modelId);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없는 환경 — 조용히 무시한다
    }
  }

  /** 듣기 — 재생 중이면 멈추고, 아니면 이 답변을 처음부터 읽는다. */
  function toggleSpeech() {
    if (speech.speaking) speech.stop();
    else speech.speak(content);
  }

  /** 이 답변 하나만 .json으로 — 컴포저의 전체 내보내기와 대비된다 */
  function exportAnswer() {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'debateAI',
      model: { id: model.id, label: model.label, vendor: model.vendor, repo: usage?.repo ?? null },
      usage: usage ?? null,
      question: query,
      answer: content,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `debateai-answer-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const buttonClass =
    'grid h-7 w-7 place-items-center rounded-full text-fg-on-dark-quiet transition-colors hover:bg-white/10 hover:text-fg-on-dark disabled:opacity-30';
  const menuItemClass =
    'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[12px] text-fg-on-dark transition-colors hover:bg-white/[0.06]';

  const totalTokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-0.5 border-t border-white/[0.07] pt-1.5">
      <button
        type="button"
        onClick={() => setFeedback((prev) => (prev === 'up' ? null : 'up'))}
        aria-pressed={feedback === 'up'}
        aria-label="도움이 되었어요"
        title="도움이 되었어요"
        className={`${buttonClass} ${feedback === 'up' ? 'text-brand-300 hover:text-brand-300' : ''}`}
      >
        <svg viewBox="0 0 24 24" className={ICON} fill={feedback === 'up' ? 'currentColor' : 'none'} aria-hidden>
          <path d="M7 21V10l4.5-7a2 2 0 0 1 2.8 2.2L13.4 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 21H7Zm0 0H3V10h4" strokeLinejoin="round" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => setFeedback((prev) => (prev === 'down' ? null : 'down'))}
        aria-pressed={feedback === 'down'}
        aria-label="도움이 되지 않았어요"
        title="도움이 되지 않았어요"
        className={`${buttonClass} ${feedback === 'down' ? 'text-rose-400 hover:text-rose-400' : ''}`}
      >
        <svg viewBox="0 0 24 24" className={ICON} fill={feedback === 'down' ? 'currentColor' : 'none'} aria-hidden>
          <path d="M17 3v11l-4.5 7a2 2 0 0 1-2.8-2.2L10.6 15H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 3H17Zm0 0h4v11h-4" strokeLinejoin="round" />
        </svg>
      </button>

      {onRegenerate && (
        <button type="button" onClick={onRegenerate} disabled={busy} aria-label="다시 생성" title="다시 생성" className={buttonClass}>
          <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.3-5.6" strokeLinecap="round" />
            <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      <button type="button" onClick={copyAnswer} aria-label="복사" title={copied ? '복사됨' : '복사'} className={buttonClass}>
        {copied ? (
          <svg viewBox="0 0 24 24" className={`${ICON} text-emerald-400`} aria-hidden>
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* 토큰 수는 메뉴를 열지 않아도 보이게 둔다 — 한도가 걸린 숫자라 자주 확인한다 */}
      {totalTokens > 0 && (
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          title="응답 세부정보 보기"
          className="ml-1 rounded-full px-1.5 font-mono text-[10px] text-fg-on-dark-quiet transition-colors hover:text-fg-on-dark-secondary"
        >
          {totalTokens.toLocaleString()} tok{usage?.estimated ? '≈' : ''}
        </button>
      )}

      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="더보기"
          title="더보기"
          className={buttonClass}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
            <circle cx="12" cy="5" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="12" cy="19" r="1.7" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute bottom-full right-0 z-40 mb-2 w-[13.5rem] overflow-hidden rounded-xl border border-white/10 bg-[#171A24] py-1.5 shadow-2xl shadow-black/50"
          >
            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { toggleSpeech(); setMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
                <path d="M4 9v6h3.5L13 19V5L7.5 9H4Z" strokeLinejoin="round" />
                <path d="M16.5 9.2a4 4 0 0 1 0 5.6M19 6.7a7.5 7.5 0 0 1 0 10.6" strokeLinecap="round" />
              </svg>
              {speech.speaking ? '듣기 중지' : '듣기'}
            </button>

            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { exportAnswer(); setMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
                <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 17v1.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V17" strokeLinecap="round" />
              </svg>
              .json 내보내기
            </button>

            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(query || content.slice(0, 200))}`}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className={menuItemClass}
              onClick={() => setMenuOpen(false)}
            >
              <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
                <circle cx="11" cy="11" r="6.5" />
                <path d="m20 20-3.6-3.6" strokeLinecap="round" />
              </svg>
              구글로 검색하기
            </a>

            <button type="button" role="menuitem" className={menuItemClass} onClick={() => { setAboutOpen(true); setMenuOpen(false); }}>
              <svg viewBox="0 0 24 24" className={ICON} aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
              </svg>
              응답 세부정보 보기
            </button>
          </div>
        )}
      </div>

      {/* 응답 세부정보 */}
      {aboutOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="닫기" onClick={() => setAboutOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <section className="relative z-10 w-full max-w-sm rounded-[var(--radius-panel)] border border-white/10 bg-[#171A24] p-5 shadow-2xl shadow-black/60">
            <h3 className="text-base font-bold text-white">응답 세부정보</h3>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">생성 엔진</dt>
                <dd className="mt-0.5 text-fg-on-dark">
                  {model.label} · {model.vendor}
                  {usage?.repo && <span className="ml-1.5 font-mono text-[11px] text-fg-on-dark-quiet">{usage.repo}</span>}
                </dd>
                {usage?.replaced && (
                  <dd className="mt-1 text-[11px] leading-relaxed text-brand-300/80">
                    고른 모델이 응답하지 않아 기본 모델로 대신 생성했습니다.
                  </dd>
                )}
              </div>

              {totalTokens > 0 && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">사용 토큰</dt>
                  <dd className="mt-0.5 text-fg-on-dark">
                    {totalTokens.toLocaleString()} tokens
                    <span className="ml-1.5 font-mono text-[11px] text-fg-on-dark-quiet">
                      (입력 {(usage?.promptTokens ?? 0).toLocaleString()} · 출력{' '}
                      {(usage?.completionTokens ?? 0).toLocaleString()})
                    </span>
                    {usage?.estimated && (
                      <span className="ml-1.5 rounded-full border border-white/10 px-1.5 py-px text-[10px] text-fg-on-dark-muted">
                        추정치
                      </span>
                    )}
                  </dd>
                  {usage?.estimated && (
                    <dd className="mt-1 text-[11px] leading-relaxed text-fg-on-dark-quiet">
                      공급자가 사용량을 알려 주지 않아 글자 수로 계산한 값입니다.
                    </dd>
                  )}
                </div>
              )}

              {usage?.effort && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">응답 강도</dt>
                  <dd className="mt-0.5 text-fg-on-dark">
                    {EFFORT_LABELS[asEffort(usage.effort)]}
                    <span className="ml-1.5 text-[11px] text-fg-on-dark-quiet">{EFFORT_HINTS[asEffort(usage.effort)]}</span>
                  </dd>
                </div>
              )}

              {createdAt && (
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">생성 시각</dt>
                  <dd className="mt-0.5 text-fg-on-dark">{new Date(createdAt).toLocaleString('ko-KR')}</dd>
                </div>
              )}

              <div>
                <dt className="font-mono text-[10px] uppercase tracking-wider text-fg-on-dark-quiet">답변 길이</dt>
                <dd className="mt-0.5 text-fg-on-dark">{content.length.toLocaleString()}자</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-fg-on-dark-quiet">
              AI가 생성한 내용이며 사실과 다를 수 있습니다. 제출 전에 직접 확인해 주세요.
            </p>
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              className="mt-4 w-full rounded-xl bg-signal py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              닫기
            </button>
          </section>
        </div>
      )}

      {/* 낭독 재생 바 — 줄 전체를 차지하도록 flex-wrap 안에서 w-full로 둔다 */}
      {speech.speaking && (
        <div className="w-full">
          <SpeechPlayer controller={speech} tone="dark" />
        </div>
      )}
    </div>
  );
}
