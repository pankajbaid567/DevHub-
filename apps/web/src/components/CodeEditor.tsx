import Editor, { loader, type EditorProps, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import { useTheme } from '../theme/context';

/**
 * Monaco is bundled locally instead of loaded from a CDN (the @monaco-editor/react default):
 * works offline, behind strict CSPs, and with pinned versions. This module is only imported
 * lazily, so Monaco's weight never touches pages that do not edit code.
 */
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    if (label === 'json') return new jsonWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });

monaco.editor.defineTheme('devhub-cyberpunk', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'ff2a6d' },
    { token: 'string', foreground: '05d9e8' },
    { token: 'number', foreground: 'f9f002' },
    { token: 'comment', foreground: '7b6aa8', fontStyle: 'italic' },
  ],
  colors: {
    'editor.background': '#120730',
    'editor.lineHighlightBackground': '#1d0d45',
    'editorCursor.foreground': '#ff2a6d',
  },
});

export interface CodeEditorProps extends Omit<EditorProps, 'theme'> {
  onMount?: OnMount;
}

export default function CodeEditor({ options, language, ...rest }: CodeEditorProps) {
  const { resolved } = useTheme();
  const theme =
    resolved === 'light' ? 'vs' : resolved === 'cyberpunk' ? 'devhub-cyberpunk' : 'vs-dark';
  return (
    <Editor
      theme={theme}
      language={language}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-muted">
          Loading editor…
        </div>
      }
      options={{
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 14,
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        insertSpaces: true,
        detectIndentation: false,
        autoIndent: 'full',
        formatOnPaste: true,
        formatOnType: true,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        autoSurround: 'languageDefined',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        suggest: { showKeywords: true, showSnippets: true },
        automaticLayout: true,
        padding: { top: 12 },
        wordWrap: 'on',
        lineNumbers: 'on',
        renderWhitespace: 'selection',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        ...options,
      }}
      {...rest}
    />
  );
}
