import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  Code2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Monitor,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../auth/context';
import { useTheme, type ThemeChoice } from '../theme/context';
import { NotificationBell } from './NotificationBell';
import { VerifyEmailBanner } from './VerifyEmailBanner';
import { Avatar } from './ui/primitives';
import { Button, ButtonLink } from './ui/Button';
import { PageSpinner } from './ui/Spinner';
import { cn } from '../lib/utils';

export function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 font-semibold tracking-tight"
      aria-label="DevHub+ home"
    >
      <img src="/favicon.svg" alt="" className="h-7 w-7" />
      <span className="text-lg">
        DevHub<span className="text-accent">+</span>
      </span>
    </Link>
  );
}

const NAV = [
  { to: '/questions', label: 'Questions', icon: MessageSquareText },
  { to: '/snippets', label: 'Snippets', icon: Code2 },
  { to: '/sessions', label: 'Live sessions', icon: Users },
  { to: '/mentor', label: 'AI Mentor', icon: Bot },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
];

const THEMES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'cyberpunk', label: 'Cyberpunk', icon: Zap },
];

function ThemeMenu() {
  const { choice, setChoice } = useTheme();
  const current = THEMES.find((t) => t.value === choice) ?? THEMES[0]!;
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]!;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setChoice(next.value)}
      aria-label={`Theme: ${current.label}. Switch to ${next.label}`}
      title={`Theme: ${current.label}`}
    >
      <current.icon className="h-5 w-5" />
    </Button>
  );
}

function SearchBox({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search questions & snippets…"
        aria-label="Search questions and snippets"
        className="h-9 w-full rounded-lg border border-line bg-surface-2 pr-3 pl-9 text-sm placeholder:text-muted focus:border-accent focus:bg-surface focus:outline-none"
      />
    </form>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  if (!user) return null;
  const item = 'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-surface-2';
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-expanded={open}
        aria-label="Account menu"
        className="rounded-full"
      >
        <Avatar name={user.displayName ?? user.username} src={user.avatarUrl} size={34} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-56 animate-slide-up rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold">{user.displayName ?? user.username}</p>
            <p className="text-xs text-muted">
              @{user.username} · {user.reputation} rep
            </p>
          </div>
          <hr className="my-1 border-line" />
          <Link to="/dashboard" className={item}>
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </Link>
          <Link to={`/u/${user.username}`} className={item}>
            <User className="h-4 w-4" /> Profile
          </Link>
          <Link to={`/u/${user.username}?tab=resume`} className={item}>
            <Sparkles className="h-4 w-4" /> Resume & skills
          </Link>
          <Link to={`/u/${user.username}?tab=account`} className={item}>
            <Settings className="h-4 w-4" /> Account settings
          </Link>
          <hr className="my-1 border-line" />
          <button
            type="button"
            className={cn(item, 'text-danger')}
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Navbar() {
  const { status } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  // Close the mobile menu on navigation (state adjustment during render, no effect needed).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
    );

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <SearchBox className="ml-auto hidden w-64 md:block" />
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <ThemeMenu />
          {status === 'authenticated' ? (
            <>
              <NotificationBell />
              <UserMenu />
            </>
          ) : status === 'anonymous' ? (
            <div className="hidden items-center gap-2 sm:flex">
              <ButtonLink to="/login" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink to="/register" size="sm">
                Join DevHub+
              </ButtonLink>
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {mobileOpen && (
        <nav
          aria-label="Mobile"
          className="animate-fade-in border-t border-line px-4 py-3 lg:hidden"
        >
          <SearchBox className="mb-3" />
          <div className="grid gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                <n.icon className="h-4 w-4" /> {n.label}
              </NavLink>
            ))}
            {status === 'anonymous' && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ButtonLink to="/login" variant="outline">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register">Join</ButtonLink>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <p>© {new Date().getFullYear()} DevHub+ · Built by Pankaj Baid</p>
        <div className="flex gap-4">
          <a href="/docs" className="hover:text-fg">
            API docs
          </a>
          <a
            href="https://github.com/pankajbaid567/DevHub-"
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Catches render errors so one broken widget never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-lg px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Something broke on this page</h1>
        <p className="mt-2 text-muted">The error has been logged. Reloading usually fixes it.</p>
        <Button className="mt-6" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
    );
  }
}

export function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-accent-fg"
      >
        Skip to content
      </a>
      <Navbar />
      <VerifyEmailBanner />
      <main id="main" className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<PageSpinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
    </div>
  );
}
