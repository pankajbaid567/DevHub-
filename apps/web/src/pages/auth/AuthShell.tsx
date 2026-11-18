import type { ReactNode } from 'react';
import { Card } from '../../components/ui/primitives';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md animate-slide-up p-8">
        <img src="/favicon.svg" alt="" className="mx-auto h-10 w-10" />
        <h1 className="mt-4 text-center text-2xl font-bold">{title}</h1>
        <p className="mt-1 mb-6 text-center text-sm text-muted">{subtitle}</p>
        {children}
      </Card>
    </div>
  );
}
