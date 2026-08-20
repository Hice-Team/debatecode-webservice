'use client';

// 마크다운 편집 툴바 — content textarea(ref)를 커서 기준으로 조작한다.
// 본문은 마크다운으로 저장되고 글 상세에서 ReactMarkdown + remarkGfm로 렌더된다.
//
// 버튼은 글자 없이 아이콘만 둔다. "🖼️ 이미지 / 📎 파일 / 🔗 링크"처럼 라벨을 달았을 때는
// 툴바가 두 줄로 접히고 서식 버튼과 첨부 버튼의 무게가 뒤섞였다. 이름은 툴팁(title)에 있다.
import type { RefObject } from 'react';

type TextareaRef = RefObject<HTMLTextAreaElement | null>;

function Btn({
  onClick,
  title,
  children,
  accent = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  /** 첨부 그룹 — 서식 버튼과 구분되도록 브랜드 색을 쓴다 */
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // textarea 포커스/선택 유지
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-grid h-8 w-8 place-items-center rounded-md transition-colors ${
        accent ? 'text-brand-600 hover:bg-brand-50' : 'text-fg-secondary hover:bg-ink/5 hover:text-ink-soft'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-ink/10" aria-hidden />;
}

/** 공통 아이콘 틀 — 모든 아이콘이 같은 굵기·크기로 보이도록 한곳에서 정한다 */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] fill-none stroke-current stroke-[1.7]" aria-hidden>
      {children}
    </svg>
  );
}

export default function MarkdownToolbar({
  textareaRef,
  onChange,
  // 기본은 textarea 위에 얹히는 테두리 박스(수정 폼). 카드 안에 들어갈 때는 flat.
  variant = 'boxed',
  onPickImage,
  onPickFile,
  onAddLink,
  onAddYoutube,
  onTogglePoll,
}: {
  textareaRef: TextareaRef;
  /** 툴바가 textarea.value를 직접 바꾼 뒤 호출 — 제어 컴포넌트가 상태를 맞출 수 있게 한다 */
  onChange?: () => void;
  variant?: 'boxed' | 'flat';
  onPickImage?: () => void;
  onPickFile?: () => void;
  onAddLink?: () => void;
  onAddYoutube?: () => void;
  onTogglePoll?: () => void;
}) {
  function withArea(fn: (ta: HTMLTextAreaElement) => void) {
    const ta = textareaRef.current;
    if (!ta) return;
    fn(ta);
    // uncontrolled textarea에 input 이벤트를 알려 검증 상태 등을 동기화
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // 제어 컴포넌트(글쓰기 폼)는 이벤트로 값을 되받지 못하므로 직접 알린다
    onChange?.();
  }

  // 선택 영역을 before/after로 감싼다. 선택이 없으면 placeholder를 넣는다.
  function wrap(before: string, after: string, placeholder = '텍스트') {
    withArea((ta) => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const has = e > s;
      const inner = has ? value.slice(s, e) : placeholder;
      ta.value = value.slice(0, s) + before + inner + after + value.slice(e);
      ta.focus();
      ta.selectionStart = s + before.length;
      ta.selectionEnd = s + before.length + inner.length;
    });
  }

  // 커서가 있는 줄(선택된 여러 줄 포함) 맨 앞에 prefix를 붙인다.
  function linePrefix(prefix: string) {
    withArea((ta) => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const lineStart = value.lastIndexOf('\n', s - 1) + 1;
      const block = value.slice(lineStart, e);
      const replaced = block
        .split('\n')
        .map((l) => (l.startsWith(prefix) ? l : prefix + l))
        .join('\n');
      ta.value = value.slice(0, lineStart) + replaced + value.slice(e);
      ta.focus();
      ta.selectionStart = lineStart;
      ta.selectionEnd = lineStart + replaced.length;
    });
  }

  function insertBlock(text: string) {
    withArea((ta) => {
      const { selectionStart: s, value } = ta;
      const pad = s > 0 && value[s - 1] !== '\n' ? '\n' : '';
      const insert = pad + text;
      ta.value = value.slice(0, s) + insert + value.slice(s);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + insert.length;
    });
  }

  const hasAttachments = onPickImage || onPickFile || onAddLink || onAddYoutube || onTogglePoll;

  return (
    <div
      className={`flex flex-wrap items-center gap-0.5 bg-paper/60 px-2 py-1.5 ${
        variant === 'flat' ? 'border-b border-hairline' : 'rounded-t-lg border border-b-0 border-ink/15'
      }`}
      role="toolbar"
      aria-label="서식"
    >
      {/* 제목 단계 */}
      <select
        aria-label="제목 단계"
        title="제목 단계"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) linePrefix(v);
          e.target.value = '';
        }}
        className="h-8 rounded-md bg-transparent px-1.5 text-xs text-fg-secondary hover:bg-ink/5 focus:outline-none"
      >
        <option value="" disabled>
          제목
        </option>
        <option value="# ">제목 1</option>
        <option value="## ">제목 2</option>
        <option value="### ">제목 3</option>
      </select>

      <Divider />

      {/* 글자 서식 */}
      <Btn title="굵게" onClick={() => wrap('**', '**')}>
        <span className="text-[15px] font-bold leading-none">B</span>
      </Btn>
      <Btn title="기울임" onClick={() => wrap('*', '*')}>
        <span className="font-serif text-[15px] italic leading-none">I</span>
      </Btn>
      <Btn title="취소선" onClick={() => wrap('~~', '~~')}>
        <span className="text-[15px] leading-none line-through">S</span>
      </Btn>

      <Divider />

      {/* 블록 서식 */}
      <Btn title="인라인 코드" onClick={() => wrap('`', '`', 'code')}>
        <Icon>
          <path d="M9 8 5 12l4 4M15 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      </Btn>
      <Btn title="코드 블록" onClick={() => insertBlock('```\n코드를 입력하세요\n```\n')}>
        <Icon>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
          <path d="M8.5 10 7 12l1.5 2M13 10l1.5 2-1.5 2" strokeLinecap="round" strokeLinejoin="round" />
        </Icon>
      </Btn>
      <Btn title="본문 링크" onClick={() => wrap('[', '](https://)', '링크 텍스트')}>
        <Icon>
          <path d="M10 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 1 0-5.7-5.7L11 6.9" strokeLinecap="round" />
          <path d="M14 10.5a4 4 0 0 0-5.7 0L6 12.8a4 4 0 1 0 5.7 5.7l1.3-1.3" strokeLinecap="round" />
        </Icon>
      </Btn>
      <Btn title="글머리 목록" onClick={() => linePrefix('- ')}>
        <Icon>
          <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeLinecap="round" />
        </Icon>
      </Btn>
      <Btn title="인용구" onClick={() => linePrefix('> ')}>
        <Icon>
          <path d="M5 5v14M9.5 8h9.5M9.5 12.5h9.5M9.5 17h6" strokeLinecap="round" />
        </Icon>
      </Btn>

      {/* 첨부 — 부모 폼이 넘긴 핸들러만 노출 */}
      {hasAttachments && <Divider />}
      {onPickImage && (
        <Btn title="이미지 첨부" accent onClick={onPickImage}>
          <Icon>
            <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
            <circle cx="9" cy="10" r="1.4" />
            <path d="m4.5 17 4.7-4.3 3.3 3 2.6-2.2 4.4 3.8" strokeLinecap="round" strokeLinejoin="round" />
          </Icon>
        </Btn>
      )}
      {onPickFile && (
        <Btn title="파일 첨부" accent onClick={onPickFile}>
          <Icon>
            <path d="M18 11.5 12.2 17.3a3.6 3.6 0 0 1-5-5.1l6.4-6.4a2.4 2.4 0 1 1 3.4 3.4l-6.4 6.4a1.2 1.2 0 0 1-1.7-1.7l5.8-5.8" strokeLinecap="round" strokeLinejoin="round" />
          </Icon>
        </Btn>
      )}
      {onAddLink && (
        <Btn title="링크 첨부 (본문 아래 목록)" accent onClick={onAddLink}>
          <Icon>
            <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
            <path d="M7.5 10h5M7.5 14h9" strokeLinecap="round" />
          </Icon>
        </Btn>
      )}
      {onAddYoutube && (
        <Btn title="유튜브 영상 첨부" accent onClick={onAddYoutube}>
          <Icon>
            <rect x="3" y="6" width="18" height="12" rx="3.5" />
            <path d="m10.5 9.5 4.5 2.5-4.5 2.5V9.5Z" strokeLinejoin="round" />
          </Icon>
        </Btn>
      )}
      {onTogglePoll && (
        <Btn title="투표 만들기" accent onClick={onTogglePoll}>
          <Icon>
            <path d="M6 19V11M12 19V5M18 19v-5" strokeLinecap="round" />
          </Icon>
        </Btn>
      )}
    </div>
  );
}
