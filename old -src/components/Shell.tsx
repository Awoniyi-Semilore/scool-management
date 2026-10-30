import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { greetingNow } from '../lib/greeting';
import GlobalSearch from './GlobalSearch';
import GuidedTour, { hasSeenTour } from './GuidedTour';

export interface NavItem { to: string; label: string }

export function Shell({ nav, title }: { nav: NavItem[]; title: string }) {
  const { profile, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState(() => !hasSeenTour(profile?.role ?? null) && !!profile);
  const who = profile?.role === 'admin' ? 'Head Teacher' : (profile?.displayName?.split(' ')[0] || 'there');

  const links = nav.map((n) => (
    <NavLink
      key={n.to}
      to={n.to}
      data-tour={`nav${n.to.replace(/\//g, '-')}`}
      end={n.to === '/admin' || n.to === '/parent' || n.to === '/teacher' || n.to === '/staff'}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `block rounded-[14px] px-3.5 py-3 text-[0.98rem] font-semibold ${isActive ? 'bg-brand-600 text-white shadow-md' : 'text-ink hover:bg-brand-50'}`
      }
    >
      {n.label}
    </NavLink>
  ));

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:gap-1 md:border-r md:border-line md:bg-surface md:p-4">
        <div className="mb-4 flex items-center gap-2">
          <img src="/Treasure Corner Community Crest.svg" alt="Treasure Corner logo" className="h-14 w-auto" />
          <p className="font-serif text-base font-bold text-brand-900">Treasure Corner</p>
        </div>
        <nav aria-label="Main menu" className="flex flex-col gap-1">{links}</nav>
        <p className="mt-auto pt-4 text-xs text-inkMuted">{title}</p>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary px-2.5 py-1.5 md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <img src="/Treasure Corner Community Crest.svg" alt="" className="h-10 w-auto md:hidden" />
            <div>
              <p className="text-sm font-semibold text-ink">{greetingNow()}, {who}</p>
              <p className="text-xs text-inkMuted">{title}</p>
            </div>
          </div>
          <div className="order-last w-full md:order-none md:w-auto md:flex-1 md:max-w-sm"><GlobalSearch /></div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2.5 py-1.5" onClick={() => setTour(true)}>Take a tour</button>
            <button className="btn-secondary px-2.5 py-1.5" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button className="btn-secondary px-2.5 py-1.5" onClick={() => logout()}>
              <LogOut className="h-4 w-4" aria-hidden /> <span>Log out</span>
            </button>
          </div>
        </header>

        {tour && <GuidedTour role={profile?.role ?? null} onClose={() => setTour(false)} />}

        {open && (
          <nav aria-label="Main menu (phone)" className="space-y-1 border-b border-line bg-surface p-3 md:hidden">{links}</nav>
        )}

        <main className="mx-auto max-w-6xl px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
