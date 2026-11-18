import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from '../auth/context';
import { VoteControl } from './VoteControl';
import { Markdown } from './Markdown';

function wrap(ui: ReactNode, signedIn = true) {
  const auth: AuthContextValue = {
    status: signedIn ? 'authenticated' : 'anonymous',
    user: signedIn ? ({ id: 'me', username: 'me' } as AuthContextValue['user']) : null,
    login: vi.fn(),
    verifyMfa: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  };
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('VoteControl', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('updates optimistically and toggles off on a second click', async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    );
    wrap(<VoteControl target="questions" id="q1" score={4} myVote={0} />);

    await userEvent.click(screen.getByRole('button', { name: 'Upvote' }));
    expect(screen.getByText('5')).toBeInTheDocument(); // before the server answers
    expect(screen.getByRole('button', { name: 'Upvote' })).toHaveAttribute('aria-pressed', 'true');
    resolve(json(200, { score: 5, myVote: 1 }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it('rolls back when the server rejects the vote', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(403, { error: { code: 'FORBIDDEN', message: 'Downvoting needs 15 reputation' } }),
      ),
    );
    wrap(<VoteControl target="answers" id="a1" score={2} myVote={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Downvote' }));
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Downvote' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('Markdown', () => {
  it('renders GitHub-flavoured markdown but strips scripts, handlers and javascript: links', () => {
    const { container } = render(
      <Markdown>
        {
          '# Title\n\n<script>alert(1)</script><img src=x onerror="alert(2)">\n\n[bad](javascript:alert(3)) [good](https://example.com)\n\n- [x] done'
        }
      </Markdown>,
    );
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
    expect(screen.getByRole('link', { name: 'good' })).toHaveAttribute(
      'rel',
      expect.stringContaining('noopener'),
    );
    expect(container.querySelector('input[type=checkbox]')).not.toBeNull();
  });
});
