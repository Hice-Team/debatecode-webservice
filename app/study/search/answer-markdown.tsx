'use client';

// 답변 본문 렌더러.
//
// 예전에는 ReactMarkdown을 그대로 두고 CSS로만 꾸몄다. 그래서 코드 블록이 "읽을 수는
// 있지만 가져다 쓸 수는 없는" 상태였다 — 개발 학습 서비스에서 답변의 절반은 코드인데,
// 그걸 드래그로 긁어 복사하게 두는 것은 도구가 할 일을 사람에게 미루는 것이다.
//
// 여기서는 코드 블록만 따로 그린다. 언어 이름과 복사 버튼이 붙고, 넘치면 가로로만 흐른다.
import { memo, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/app/context/language-context';
import { t } from '@/app/lib/i18n';

const PROSE =
  'prose-sm max-w-none text-[15px] leading-[1.85] text-fg [&_a]:text-signal [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-7 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-fg [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-fg [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_strong]:font-semibold [&_strong]:text-fg [&_table]:my-4 [&_table]:w-full [&_table]:text-[13px] [&_td]:border-t [&_td]:border-hairline [&_td]:py-1.5 [&_td]:pr-3 [&_th]:pb-1.5 [&_th]:pr-3 [&_th]:text-left [&_th]:font-semibold [&_ul]:list-disc [&_ul]:pl-5';

/** 문단 안에 섞이는 짧은 코드 — 배경만 옅게 깔아 글 흐름을 끊지 않는다. */
function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-[var(--radius-control)] bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-fg">
      {children}
    </code>
  );
}

/** 여러 줄 코드 — 언어 이름과 복사 버튼을 머리글에 둔다. */
function CodeBlock({ language: lang, code }: { language: string; code: string }) {
  const { language } = useLanguage();
  const [copied, setCopied] = useState(false);

  // 복사했다는 표시는 잠깐만 — 그대로 두면 다음에 눌렀을 때 눌렸는지 알 수 없다
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // 클립보드를 못 쓰는 환경(비보안 출처 등) — 조용히 넘긴다. 글은 드래그로 복사할 수 있다.
    }
  }

  return (
    <div className="my-4 overflow-hidden rounded-[var(--radius-panel)] bg-ink">
      <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wide text-fg-on-dark-quiet">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-[11px] font-medium text-fg-on-dark-secondary transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[2.4]" aria-hidden>
                <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('copied', language)}
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-[1.8]" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
              </svg>
              {t('copy', language)}
            </>
          )}
        </button>
      </div>
      <pre className="dc-scroll overflow-x-auto px-4 py-3">
        <code className="font-mono text-[12.5px] leading-relaxed text-fg-on-dark">{code}</code>
      </pre>
    </div>
  );
}

/** ```lang 에서 언어 이름만 꺼낸다. */
function languageOf(className: unknown): string {
  return typeof className === 'string' ? (/language-([\w+-]+)/.exec(className)?.[1] ?? '') : '';
}

function AnswerMarkdown({ children }: { children: string }) {
  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ReactMarkdown 10은 인라인/블록을 code 하나로 준다. 블록이면 부모가 <pre>이고
          // className에 language-*가 붙는다 — 그 둘로 갈라 그린다.
          code({ className, children: content, ...props }) {
            const text = String(content ?? '').replace(/\n$/, '');
            const lang = languageOf(className);
            if (!lang && !text.includes('\n')) return <InlineCode {...props}>{content}</InlineCode>;
            return <CodeBlock language={lang} code={text} />;
          },
          // 코드 블록을 위에서 통째로 그리므로 <pre> 껍데기는 지나가게 둔다
          pre({ children: content }) {
            return <>{content}</>;
          },
          // 표가 넘칠 때 페이지가 아니라 표만 옆으로 흐르게 한다
          table({ children: content }) {
            return (
              <div className="dc-scroll -mx-1 my-4 overflow-x-auto px-1">
                <table className="w-full">{content}</table>
              </div>
            );
          },
          a({ href, children: content }) {
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {content}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

// 답변은 흘러나오는 동안 매 토큰마다 다시 그려진다 — 내용이 같으면 건너뛴다
export default memo(AnswerMarkdown);
