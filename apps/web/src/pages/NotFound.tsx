import { ButtonLink } from '../components/ui/Button';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-28 text-center">
      <p className="font-mono text-6xl font-bold text-accent">404</p>
      <h1 className="mt-4 text-2xl font-semibold">This page wandered off</h1>
      <p className="mt-2 text-muted">
        The link may be broken, or the content was removed or is private.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink to="/">Go home</ButtonLink>
        <ButtonLink to="/questions" variant="outline">
          Browse questions
        </ButtonLink>
      </div>
    </div>
  );
}
