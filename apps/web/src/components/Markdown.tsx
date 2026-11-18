import { memo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { SegmentedControl } from './ui/primitives';
import { Textarea } from './ui/Field';

/**
 * User-generated markdown is sanitised (no raw HTML, scripts, event handlers or javascript:
 * URLs) BEFORE syntax highlighting adds its own class names, so XSS through questions,
 * answers or AI replies is not possible.
 */
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]],
  },
};

function CodeBlockPre({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const text = e.currentTarget.parentElement?.querySelector('code')?.textContent ?? '';
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group relative">
      <pre {...props}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute top-2 right-2 rounded-md border border-line bg-surface p-1.5 text-muted opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

const components: Components = {
  pre: CodeBlockPre,
  a: ({ href, children, ...props }) => {
    const external = href?.startsWith('http');
    return (
      <a
        href={href}
        {...props}
        {...(external && { target: '_blank', rel: 'noopener noreferrer nofollow' })}
      >
        {children}
      </a>
    );
  },
};

export const Markdown = memo(function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={cn('prose-devhub', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeSanitize, schema],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});

interface EditorProps {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  describedBy?: string;
}

/** Write/Preview markdown editor. */
export function MarkdownEditor({
  value,
  onChange,
  id,
  placeholder,
  rows = 10,
  invalid,
  describedBy,
}: EditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <SegmentedControl
          label="Editor mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
        <span className="text-xs text-muted">
          Markdown supported · fenced code blocks get highlighting
        </span>
      </div>
      {mode === 'write' ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="font-mono text-[13px]"
        />
      ) : (
        <div className="min-h-40 rounded-lg border border-line bg-surface px-4 py-3">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
