import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Role } from '../types';
import { tourSteps } from '../lib/tour';

/** Shows once per role on a device, and can be restarted from the header. Skip is always available. */
export function tourKey(role: Role | null): string {
  return `tc.tour.${role ?? 'none'}.done`;
}

export function hasSeenTour(role: Role | null): boolean {
  return localStorage.getItem(tourKey(role)) === '1';
}

export default function GuidedTour({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const steps = tourSteps(role);
  const [i, setI] = useState(0);
  const nav = useNavigate();
  // Each step opens the page it describes, so the person sees where it is.
  useEffect(() => {
    if (!steps[i]) return;
    nav(steps[i].to);
    // Highlight the menu item the step describes, once the page has changed.
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${steps[i].target}"]`) as HTMLElement | null;
      el?.classList.add('tour-highlight');
      el?.scrollIntoView({ block: 'nearest' });
    }, 350);
    return () => { clearTimeout(t); document.querySelectorAll('.tour-highlight').forEach((n) => n.classList.remove('tour-highlight')); };
  }, [i]);
  if (steps.length === 0) return null;
  const last = i === steps.length - 1;
  const finish = () => { localStorage.setItem(tourKey(role), '1'); onClose(); };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/10 p-4 sm:items-end sm:justify-end" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="card w-full max-w-md space-y-4 border-2 border-brand-200 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step {i + 1} of {steps.length}</p>
        <h2 className="text-xl font-bold text-brand-900">{steps[i].title}</h2>
        <p className="text-sm text-inkMuted">{steps[i].body}</p>
        <p className="text-xs text-inkMuted">The page behind this guide shows the feature being described. Select Next to continue or Back to review the previous step.</p>
        <div className="flex items-center justify-between gap-2">
          <button className="btn-secondary" onClick={finish}>Skip tour</button>
          <div className="flex gap-2">
            {i > 0 && <button className="btn-secondary" onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn-primary" onClick={last ? finish : () => setI(i + 1)}>{last ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
