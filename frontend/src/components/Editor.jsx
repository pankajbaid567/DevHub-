import React, { useState } from 'react';
import Editor from '@monaco-editor/react';
import { Copy, Download, Play, Settings } from 'lucide-react';

const CodeEditor = ({ 
  value = '', 
  onChange,
  language = 'javascript',
  theme = 'vs-dark',
  height = '400px',
  readOnly = false,
  showActions = true,
  className = ''
}) => {
  const [editorValue, setEditorValue] = useState(value);
  const [isLoading, setIsLoading] = useState(true);

  const handleEditorChange = (newValue) => {
    setEditorValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    setIsLoading(false);
    
    // Configure editor options
    editor.updateOptions({
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      minimap: { enabled: false },
    });

    // Define custom theme
    monaco.editor.defineTheme('devhub-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '8B5CF6' },
        { token: 'string', foreground: '10B981' },
        { token: 'number', foreground: 'F59E0B' },
      ],
      colors: {
        'editor.background': '#0F172A',
        'editor.foreground': '#E2E8F0',
        'editorLineNumber.foreground': '#64748B',
        'editor.selectionBackground': '#334155',
        'editor.lineHighlightBackground': '#1E293B',
      }
    });

    monaco.editor.defineTheme('devhub-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6B7280', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7C3AED' },
        { token: 'string', foreground: '059669' },
        { token: 'number', foreground: 'D97706' },
      ],
      colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#1E293B',
        'editorLineNumber.foreground': '#94A3B8',
        'editor.selectionBackground': '#E2E8F0',
        'editor.lineHighlightBackground': '#F8FAFC',
      }
    });

    // Set theme based on current mode
    const isDark = document.documentElement.classList.contains('dark');
    monaco.editor.setTheme(isDark ? 'devhub-dark' : 'devhub-light');
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(editorValue);
      // You can add a toast notification here
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const downloadCode = () => {
    const blob = new Blob([editorValue], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${getFileExtension(language)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFileExtension = (lang) => {
    const extensions = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      cpp: 'cpp',
      csharp: 'cs',
      html: 'html',
      css: 'css',
      json: 'json',
      markdown: 'md',
      sql: 'sql',
      shell: 'sh',
      yaml: 'yml',
    };
    return extensions[lang] || 'txt';
  };

  return (
    <div className={`border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden ${className}`}>
      {showActions && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300 capitalize">
              {language}
            </span>
            <div className="flex space-x-1">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
              <div className="w-3 h-3 rounded-full bg-green-400"></div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              title="Copy code"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={downloadCode}
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              title="Download code"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      
      <div className="relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-slate-800">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        )}
        
        <Editor
          height={height}
          language={language}
          value={editorValue}
          theme={document.documentElement.classList.contains('dark') ? 'devhub-dark' : 'devhub-light'}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly: readOnly,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            fontFamily: 'JetBrains Mono, Monaco, Consolas, monospace',
            fontSize: 14,
            lineHeight: 20,
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditor;