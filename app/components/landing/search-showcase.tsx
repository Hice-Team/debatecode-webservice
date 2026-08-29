'use client';

// 랜딩 "AI 검색" 섹션의 클릭 가능한 데모.
//
// 실제 /study/search 화면을 그대로 축소해 옮겼다 — 오른쪽 브랜드 말풍선, 말풍선 없는
// 답변 본문, 모델 표기, 반응 툴바, 면책 줄, 아래 컴포저 필까지. 가짜 브라우저 창이나
// 지어낸 화면을 그리지 않는다(DESIGN.md §8). 공용 문구는 i18n에서 그대로 가져와
// 제품 카피가 바뀌면 랜딩도 같이 바뀌게 둔다.
//
// 잉크 밴드 위에 놓이므로 프레임은 페이퍼다 — 어두운 면 위의 밝은 제품 화면.
// 눌러 볼 수 있는 것은 프레임 **밖**의 질문 칩 세 개뿐이다. 프레임 안의 아이콘들은
// 화면의 일부라 aria-hidden으로 둔다 — 눌리지 않는 것을 버튼처럼 읽히게 하지 않는다.
import { useId, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

type Lang = 'ko' | 'en';

interface Preset {
  key: string;
  /** 칩 라벨 — 이 기능이 하는 일 하나 */
  label: string;
  /** 오른쪽 말풍선에 들어가는 질문 */
  query: string;
  /** 답변 문단 — 실제 화면처럼 두 문단까지 */
  answer: string[];
  /**
   * 답변에 붙는 코드. 줄 첫 글자가 `-`/`+`면 제거·추가로 색을 준다.
   * 개념 질문처럼 코드가 나오지 않는 답도 있어 선택값이다.
   */
  code?: string[];
}

const MODEL = { label: 'DeepSeek V4 Flash', vendor: 'DeepSeek' };

const COPY: Record<Lang, { pick: string; presets: Preset[]; open: string }> = {
  ko: {
    pick: '질문을 골라 보세요',
    open: 'AI 검색 열기 →',
    presets: [
      {
        key: 'find',
        label: '코드 검색',
        query: '파이썬 딕셔너리를 값 기준으로 정렬하려면',
        answer: [
          'sorted()에 key를 넘기면 됩니다. 값으로 정렬할 때는 itemgetter(1)이 lambda보다 조금 빠릅니다.',
          '내림차순이 필요하면 reverse=True를 함께 넘기세요.',
        ],
        code: ['from operator import itemgetter', '', 'sorted(d.items(), key=itemgetter(1))'],
      },
      {
        key: 'analyze',
        label: '코드 분석',
        query: '입력이 커지면 이 코드가 갑자기 느려지는 이유가 뭔가요',
        answer: [
          '리스트에 대한 in 검사가 매번 앞에서부터 훑습니다. 반복문 안에 있으니 전체가 O(n²)가 되고, n이 커질 때 시간이 제곱으로 늘어납니다.',
          'seen을 set으로 바꾸면 검사 한 번이 평균 O(1)이 되어 전체가 O(n)으로 내려갑니다.',
        ],
        code: ['- if num in seen_list:', '+ if num in seen_set:'],
      },
      {
        key: 'concept',
        label: '개념 탐색',
        query: '해시 충돌은 왜 생기고 어떻게 푸나요',
        answer: [
          '키의 가짓수가 버킷 수보다 많으면 서로 다른 키가 같은 칸을 가리킵니다. 해시 함수가 나빠서가 아니라 칸이 유한해서 생기는 일입니다.',
          '체이닝은 그 칸에 목록을 달아 두고, 개방 주소법은 다음 빈 칸을 찾아갑니다. 앞은 메모리를 더 쓰고, 뒤는 삭제 처리가 까다롭습니다.',
        ],
      },
    ],
  },
  en: {
    pick: 'Pick a question',
    open: 'Open AI Search →',
    presets: [
      {
        key: 'find',
        label: 'Code search',
        query: 'How do I sort a Python dict by value?',
        answer: [
          'Pass a key to sorted(). When sorting by value, itemgetter(1) is a touch faster than a lambda.',
          'Add reverse=True when you need descending order.',
        ],
        code: ['from operator import itemgetter', '', 'sorted(d.items(), key=itemgetter(1))'],
      },
      {
        key: 'analyze',
        label: 'Code analysis',
        query: 'Why does this get slow once the input grows?',
        answer: [
          'Each membership check scans the list from the start. Inside a loop that makes the whole routine O(n²), so time grows with the square of n.',
          'Switching seen to a set makes each check O(1) on average and brings the routine back to O(n).',
        ],
        code: ['- if num in seen_list:', '+ if num in seen_set:'],
      },
      {
        key: 'concept',
        label: 'Concept',
        query: 'Why do hash collisions happen, and how are they resolved?',
        answer: [
          'When there are more possible keys than buckets, two keys land in the same slot. It is not a bad hash function — it is that the slots are finite.',
          'Chaining hangs a list off that slot; open addressing walks to the next free one. The first spends memory, the second makes deletion awkward.',
        ],
      },
    ],
  },
};

/** 코드 줄의 앞 글자(-/+)로 제거·추가를 구분한다. 없으면 평범한 줄. */
function codeTone(line: string): string {
  if (line.startsWith('-')) return 'text-rose-300';
  if (line.startsWith('+')) return 'text-emerald-300';
  return 'text-white/90';
}

/** 반응 툴바 아이콘 — 실제 화면의 좋아요·싫어요·다시 생성·복사 */
const TOOLBAR_PATHS = [
  'M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4.5-7.5A2 2 0 0 1 15 5v4h4.2a2 2 0 0 1 2 2.4l-1.4 7A2 2 0 0 1 17.8 20H7',
  'M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3Zm0 0-4.5 7.5A2 2 0 0 1 9 19v-4H4.8a2 2 0 0 1-2-2.4l1.4-7A2 2 0 0 1 6.2 4H17',
  'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  'M9 9V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3M4 11a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7Z',
];

export default function SearchShowcase() {
  const { language } = useLanguage();
  const c = COPY[language];
  const [key, setKey] = useState(c.presets[0].key);
  const panelId = useId();

  const active = c.presets.find((p) => p.key === key) ?? c.presets[0];

  return (
    <div>
      {/* 데모를 움직이는 것 — 프레임 밖에 둔다. 제품에 없는 기능을 화면 안에 그리지 않는다. */}
      <p id={`${panelId}-label`} className="mb-2.5 text-[12px] font-semibold text-fg-on-dark-muted">
        {c.pick}
      </p>
      <div role="tablist" aria-labelledby={`${panelId}-label`} className="mb-3 flex flex-wrap gap-2">
        {c.presets.map((p) => {
          const on = p.key === key;
          return (
            <button
              key={p.key}
              id={`${panelId}-${p.key}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId}
              onClick={() => setKey(p.key)}
              className={`min-h-11 inline-flex items-center rounded-full border px-4 text-[13px] font-medium transition-colors duration-[var(--duration-state)] focus-visible:ring-2 focus-visible:ring-brand-300 ${
                on
                  ? 'border-brand-400 bg-brand-500/15 text-brand-200'
                  : 'border-hairline-on-dark text-fg-on-dark-muted hover:border-brand-400/40 hover:text-fg-on-dark-secondary'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* 제품 화면 — 실제 /study/search의 구조를 그대로 줄인 것 */}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${panelId}-${active.key}`}
        tabIndex={0}
        className="rounded-[var(--radius-panel)] bg-paper p-5 shadow-[0_24px_60px_-24px_rgba(8,9,26,0.6)] sm:p-6"
      >
        {/* 내 질문 */}
        <div className="flex justify-end">
          <p className="max-w-[88%] rounded-[var(--radius-panel)] bg-brand-50 px-4 py-3 text-[14px] font-medium text-fg">
            {active.query}
          </p>
        </div>

        {/* 답변 — 말풍선 없이 본문으로 */}
        <div className="mt-6 text-[14px] leading-[1.85] text-fg">
          {active.answer.map((para) => (
            <p key={para} className="my-3 first:mt-0">
              {para}
            </p>
          ))}

          {active.code && (
            <pre className="dc-scroll my-3 overflow-x-auto rounded-xl bg-ink p-4 font-mono text-[12px] leading-relaxed">
              {active.code.map((line, i) => (
                <code key={`${line}-${i}`} className={`block min-h-[1.2em] ${codeTone(line)}`}>
                  {line}
                </code>
              ))}
            </pre>
          )}
        </div>

        <p className="mt-3 font-mono text-[10px] text-fg-quiet">
          {MODEL.label} · {MODEL.vendor}
        </p>

        {/* 반응 툴바 — 화면의 일부이지 이 데모에서 누를 것은 아니다 */}
        <div aria-hidden className="mt-5 flex items-center gap-1 border-t border-hairline pt-3 text-fg-muted">
          {TOOLBAR_PATHS.map((d) => (
            <span key={d} className="grid h-9 w-9 place-items-center">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.6]">
                <path d={d} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          ))}
          <span className="grid h-9 w-9 place-items-center">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </span>
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-fg-muted">
          <span aria-hidden className="mt-px shrink-0">
            ⚠
          </span>
          {t('ai-search-disclaimer', language)}
        </p>

        {/* 컴포저 — 실제 화면의 필 모양 입력줄 */}
        <div className="mt-5 flex items-center gap-1 rounded-[1.75rem] border border-hairline bg-surface p-2 shadow-[0_2px_10px_rgba(24,0,172,0.06),0_10px_36px_rgba(24,0,172,0.12)]">
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center text-fg-muted">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-[1.6]">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate px-1 text-[14px] text-fg-quiet">
            {t('ai-search-followup-placeholder', language)}
          </span>
          <span
            aria-hidden
            className="hidden shrink-0 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium text-fg-secondary sm:inline-flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
            {MODEL.label}
          </span>
          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center text-fg-muted">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-none stroke-current stroke-[1.6]">
              <path d="M12 4a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-5 0v-5A2.5 2.5 0 0 1 12 4Z" />
              <path d="M6 11a6 6 0 0 0 12 0M12 17v3" strokeLinecap="round" />
            </svg>
          </span>
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-signal text-white shadow-[0_2px_8px_rgba(24,0,172,0.28)]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
            </svg>
          </span>
        </div>

        <p className="mt-2.5 text-center text-[11px] text-fg-quiet">{t('ai-composer-hint', language)}</p>

        <Link
          href="/study/search"
          className="mt-4 block border-t border-hairline pt-3.5 text-center text-[12px] font-semibold text-signal transition-colors duration-[var(--duration-state)] hover:underline"
        >
          {c.open}
        </Link>
      </div>
    </div>
  );
}
