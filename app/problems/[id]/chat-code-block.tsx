'use client';

// 답변 속 코드 블록 — 읽고 끝나지 않게, 가져갈 수 있는 형태로 만든다.
//
// Ask 모드에서 모델이 코드를 보여 주면 이용자는 그걸 손으로 옮겨 적거나 드래그해 복사한다.
// 그 두 동작이 학습과 아무 상관이 없어서, 블록 위에 [복사] [에디터로]를 붙였다.
// 에디터로 보내는 것은 현재 코드를 덮어쓰는 일이라 한 번 확인을 받는다.
import { useState, type ReactNode } from 'react';

/** 마크다운 노드에서 순수 텍스트만 긁어낸다 — 코드 블록은 대개 문자열 하나지만 중첩될 때가 있다 */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

export default function ChatCodeBlock({
  children,
  onApply,
}: {
  children: ReactNode;
  /** 에디터로 보내기 — 없으면 복사 버튼만 붙는다 */
  onApply?: (code: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const code = nodeText(children).replace(/\s+$/, '');

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // 클립보드 권한이 없으면 조용히 넘긴다 — 드래그 복사는 여전히 된다
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <div className="flex items-center gap-1 border-b border-white/10 bg-white/[0.03] px-2 py-1">
        <span className="font-mono text-[9px] uppercase tracking-wider text-fg-on-dark-quiet">code</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-fg-on-dark-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? '복사됨' : '복사'}
          </button>
          {onApply && (
            <button
              type="button"
              onClick={() => onApply(code)}
              title="이 코드를 에디터로 옮깁니다 (현재 코드는 덮어써집니다)"
              className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-brand-300 transition-colors hover:bg-brand-600/20 hover:text-brand-200"
            >
              에디터로 →
            </button>
          )}
        </div>
      </div>
      <pre className="dc-scroll overflow-x-auto p-3 font-mono text-[12px] leading-relaxed text-fg-on-dark">{children}</pre>
    </div>
  );
}
