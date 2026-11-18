import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import type { VoteResultDto, VoteValue } from '@devhub/shared';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../auth/context';
import { cn } from '../lib/utils';

interface Props {
  target: 'questions' | 'answers';
  id: string;
  score: number;
  myVote: VoteValue;
  disabled?: boolean;
  onChange?: (r: VoteResultDto) => void;
}

/**
 * Optimistic voting: the UI updates instantly and rolls back if the server rejects the vote.
 * Clicking the active arrow again retracts the vote.
 */
export function VoteControl({ target, id, score, myVote, disabled, onChange }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ score, myVote });

  const mutation = useMutation({
    mutationFn: (value: VoteValue) =>
      api<VoteResultDto>(`/${target}/${id}/vote`, { method: 'POST', body: { value } }),
    onMutate: (value) => {
      const prev = state;
      setState({ score: prev.score - prev.myVote + value, myVote: value });
      return prev;
    },
    onError: (err, _v, prev) => {
      if (prev) setState(prev);
      toast.error(errorMessage(err));
    },
    onSuccess: (r) => {
      setState(r);
      onChange?.(r);
    },
  });

  const vote = (dir: 1 | -1) => {
    if (!user) return navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    mutation.mutate(state.myVote === dir ? 0 : dir);
  };

  const btn = 'rounded-full p-1.5 transition-colors disabled:opacity-40 hover:bg-surface-2';
  return (
    <div className="flex flex-col items-center gap-0.5" aria-label="Votes">
      <button
        type="button"
        className={cn(btn, state.myVote === 1 && 'bg-accent-soft text-accent')}
        onClick={() => vote(1)}
        disabled={disabled}
        aria-pressed={state.myVote === 1}
        aria-label="Upvote"
      >
        <ChevronUp className="h-6 w-6" />
      </button>
      <span
        className={cn('text-lg font-semibold tabular-nums', state.score < 0 && 'text-danger')}
        aria-live="polite"
      >
        {state.score}
      </span>
      <button
        type="button"
        className={cn(btn, state.myVote === -1 && 'bg-danger/10 text-danger')}
        onClick={() => vote(-1)}
        disabled={disabled}
        aria-pressed={state.myVote === -1}
        aria-label="Downvote"
      >
        <ChevronDown className="h-6 w-6" />
      </button>
    </div>
  );
}
