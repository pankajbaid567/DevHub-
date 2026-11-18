import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { TagDto } from '@devhub/shared';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { cn } from '../../lib/utils';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  max?: number;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
}

const normalise = (t: string) => t.trim().toLowerCase().replace(/\s+/g, '-');

/** Chip input with autocomplete from popular tags. Enter/comma adds, Backspace removes. */
export function TagInput({ value, onChange, max = 5, id, invalid, describedBy }: Props) {
  const [draft, setDraft] = useState('');
  const prefix = normalise(draft);
  const { data: suggestions = [] } = useQuery({
    queryKey: qk.tags(prefix),
    queryFn: () => api<TagDto[]>('/tags', { query: { q: prefix } }),
    enabled: prefix.length > 0,
    staleTime: 60_000,
  });

  const add = (raw: string) => {
    const t = normalise(raw);
    if (!t || value.includes(t) || value.length >= max) return;
    onChange([...value, t]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const options = suggestions.filter((s) => !value.includes(s.name)).slice(0, 6);

  return (
    <div className="relative">
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
          invalid && 'border-danger',
        )}
      >
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent"
          >
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              aria-label={`Remove tag ${t}`}
              className="rounded hover:text-fg"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add(draft)}
          disabled={value.length >= max}
          placeholder={value.length >= max ? `Maximum ${max} tags` : 'Add a tag and press Enter'}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted/70"
        />
      </div>
      {options.length > 0 && draft && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lg"
        >
          {options.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s.name)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <span className="font-mono">{s.name}</span>
                <span className="text-xs text-muted">{s.questionCount} questions</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
