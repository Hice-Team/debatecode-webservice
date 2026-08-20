'use client';

import dynamic from 'next/dynamic';
import type { Language } from '@/app/lib/types';

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

interface Props {
  language: Language;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function EditorPanel({ language, value, onChange, readOnly }: Props) {
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
        fontSize: 14,
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: language === 'python' ? 4 : 2,
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: 'line',
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  );
}
