import { useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { LogOut, Menu, Moon, Sun, X, GraduationCap, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { greetingNow } from '../lib/greeting';
import GlobalSearch from './GlobalSearch';
import GuidedTour, { hasSeenTour } from './GuidedTour';

export interface NavItem { to: string; label: string }

function sectionFor(item: NavItem, title: string): string {
  if (title === 'Head Teacher') {
    if (item.to === '/admin') return 'Home';
    if (['/admin/register', '/admin/verify'].includes(item.to)) return 'Fees & payments';
    if (['/admin/pupils', '/admin/classes', '/admin/teachers'].includes(item.to)) return 'School records';
    if (['/admin/reports', '/admin/statements'].includes(item.to)) return 'Financial records';
    if (['/admin/results', '/admin/report-review'].includes(item.to)) return 'Academic review';
    return 'Administration';
  }
  if (title === 'Parent / Guardian') {
    if (item.to === '/parent') return 'My family';
    if (['/parent/fees', '/parent/submit'].includes(item.to)) return 'Fees & payments';
    if (['/parent/receipts', '/parent/statements', '/parent/report'].includes(item.to)) return 'My records';
    return 'Account';
  }
  if (item.to === '/teacher') return 'Home';
  if (['/teacher/results', '/teacher/comments'].includes(item.to)) return 'Teaching';
  return 'Account';
}

export function Shell({ nav, title }: { nav: NavItem[]; title: string }) {
  const { profile, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [tour, setTour] = useState(() => !hasSeenTour(profile?.role ?? null) && !!profile);
  const who = profile?.role === 'admin' ? 'Head Teacher' : (profile?.displayName?.split(' ')[0] || 'there');

  const groupedNav = useMemo(() => {
    const order = title === 'Head Teacher'
      ? ['Home', 'Fees & payments', 'School records', 'Financial records', 'Academic review', 'Administration']
      : title === 'Parent / Guardian'
        ? ['My family', 'Fees & payments', 'My records', 'Account']
        : ['Home', 'Teaching', 'Account'];
    return order.map((group) => ({
      group,
      items: nav.filter((item) => sectionFor(item, title) === group),
    })).filter((group) => group.items.length > 0);
  }, [nav, title]);

  function renderLinks() {
    return groupedNav.map(({ group, items }) => (
      <div key={group} className="nav-section">
        <p className="nav-section-label">{group}</p>
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            data-tour={`nav${n.to.replace(/\\//g, '-')}`}
            end={n.to === '/admin' || n.to === '/parent' || n.to === '/teacher' || n.to === '/staff'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `nav-link ${isActive ? 'nav-link-active' : ''}`
            }
          >
            {n.to === '/admin' || n.to === '/parent' || n.to === '/teacher'
              ? <LayoutDashboard className="nav-link-icon" aria-hidden />
              : null}
            <span>{n.label}</span>
          </NavLink>
        ))}
      </div>
    ));
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="app-sidebar hidden md:sticky md:top-0 md:flex md:h-screen md:w-64 md:flex-col">
        <div className="app-brand">
          <img src="/treasure-corner-logo-compact.svg" alt="Treasure Corner Schools" className="h-12 w-auto" />
          <div className="min-w-0">
            <p className="font-serif text-base font-bold text-brand-900">Treasure Corner</p>
            <p className="text-xs text-inkMuted">School portal</p>
          </div>
        </div>
        <nav aria-label="Main menu" className="app-nav">{renderLinks()}</nav>
        <div className="sidebar-footer">
          <div className="flex items-center gap-2">
            <span className="avatar-mark"><GraduationCap className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.displayName || who}</p>
              <p className="truncate text-xs text-inkMuted">{title}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="app-topbar flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className="btn-secondary px-2.5 py-1.5 md:hidden"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <img src="/treasure-corner-logo-compact.svg" alt="" className="h-9 w-auto md:hidden" />
            <div>
              <p className="text-sm font-semibold text-ink">{greetingNow()}, {who}</p>
              <p className="text-xs text-inkMuted">{title}</p>
            </div>
          </div>
          <div className="order-last w-full md:order-none md:w-auto md:flex-1 md:max-w-md"><GlobalSearch /></div>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2.5 py-1.5" onClick={() => setTour(true)}>Help</button>
            <button className="btn-secondary px-2.5 py-1.5" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button className="btn-secondary px-2.5 py-1.5" onClick={() => logout()}>
              <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </header>

        {tour && <GuidedTour role={profile?.role ?? null} onClose={() => setTour(false)} />}

        {open && (
          <nav aria-label="Main menu (phone)" className="app-mobile-nav space-y-1 border-b border-line bg-surface p-3 md:hidden">{renderLinks()}</nav>
        )}

        <main className="app-main mx-auto max-w-[1440px] px-4 py-5 md:px-6 md:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
