'use client';

import dynamic from 'next/dynamic';
import type { Language } from '@/app/lib/types';
import { EDITOR_DEFAULTS, editorFontStack, type EditorPrefs } from '@/app/lib/user-prefs';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center font-mono text-xs text-fg-on-dark-quiet">
      에디터 로딩 중…
    </div>
  ),
});

const MONACO_LANGUAGE: Record<Language, string> = {
  javascript: 'javascript',
  python: 'python',
};

/** 언어별 관행 — 설정에서 "언어를 따름"(0)을 고르면 이 값을 쓴다 */
const LANGUAGE_TAB_SIZE: Record<Language, number> = {
  javascript: 2,
  python: 4,
};

interface Props {
  language: Language;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /** 설정 › 일반 › 코드 에디터에서 고른 값. 없으면 기본값으로 연다. */
  prefs?: EditorPrefs;
}

export default function EditorPanel({ language, value, onChange, readOnly, prefs }: Props) {
  const p = prefs ?? EDITOR_DEFAULTS;

  return (
    <MonacoEditor
      height="100%"
      language={MONACO_LANGUAGE[language]}
      value={value}
      onChange={(v) => onChange(v ?? '')}
      theme="debate-ink"
      beforeMount={(monaco) => {
        monaco.editor.defineTheme('debate-ink', {
          base: 'vs-dark',
          inherit: true,
          rules: [],
          colors: {
            'editor.background': '#0B0D12',
            'editor.lineHighlightBackground': '#12141C',
            'editorLineNumber.foreground': '#3A3F4E',
            'editorCursor.foreground': '#7D78FB',
            'editor.selectionBackground': '#5B4CF04D',
          },
        });
      }}
      options={{
        readOnly,
        fontSize: p.fontSize,
        fontFamily: editorFontStack(p.fontFamily),
        minimap: { enabled: p.minimap },
        wordWrap: p.wordWrap ? 'on' : 'off',
        // 자동 완성을 끄면 후보 창과 인라인 제안을 함께 닫는다 —
        // 하나만 끄면 "껐는데 여전히 뜬다"가 된다.
        quickSuggestions: p.autocomplete,
        suggestOnTriggerCharacters: p.autocomplete,
        wordBasedSuggestions: p.autocomplete ? 'currentDocument' : 'off',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: p.tabSize > 0 ? p.tabSize : LANGUAGE_TAB_SIZE[language],
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  );
}
