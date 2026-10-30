import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2 } from 'lucide-react';

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-8 text-sm text-inkMuted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {text}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-inkMuted">{hint}</p>}
    </div>
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100',
    success: 'border-ocean-500 bg-ocean-50 text-ocean-900 dark:bg-ocean-50 dark:text-ocean-900',
    info: 'border-ocean-500 bg-ocean-50 text-ocean-900',
  }[kind];
  const Icon = kind === 'error' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border-l-4 p-3 text-sm ${styles}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export type BadgeStatus = 'pending' | 'confirmed' | 'approved' | 'rejected';

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const label: Record<BadgeStatus, string> = {
    pending: 'Pending review',
    confirmed: 'Confirmed',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  const shape: Record<BadgeStatus, string> = { pending: '◷', confirmed: '✓', approved: '✓', rejected: '✕' };
  const tone: Record<BadgeStatus, string> = {
    pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
    confirmed: 'bg-ocean-100 text-ocean-900 dark:bg-ocean-100 dark:text-ocean-900',
    approved: 'bg-ocean-100 text-ocean-900 dark:bg-ocean-100 dark:text-ocean-900',
    rejected: 'bg-red-100 text-red-900 dark:bg-red-900 dark:text-red-100',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <span aria-hidden>{shape[status]}</span> {label[status]}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, kicker }: { title: string; subtitle?: string; actions?: ReactNode; kicker?: string }) {
  return (
    <div className="hero mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="relative z-10">
        {kicker && <p className="kicker text-marigold-200 dark:text-marigold-500">{kicker}</p>}
        <h1 className="text-3xl font-bold leading-tight text-white md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[1.05rem] text-white/85">{subtitle}</p>}
      </div>
      {actions && <div className="relative z-10 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
