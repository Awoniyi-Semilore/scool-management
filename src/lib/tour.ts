import type { Role } from '../types';

export interface TourStep { title: string; body: string; to: string; target: string }

/** Short tour per role. Each role sees only the steps for pages it can use. */
export function tourSteps(role: Role | null): TourStep[] {
  switch (role) {
    case 'admin':
      return [
        { title: 'Overview', body: 'Start here for what needs you today: payments to check and results to review.' , to: '/admin', target: 'nav-admin' },
        { title: 'Fee register', body: 'Pick a class and click a child to see and change their fees, or record a payment.' , to: '/admin/register', target: 'nav-admin-register' },
        { title: 'Verify payments', body: 'Confirm or reject payments parents have sent. Nothing counts until you confirm it.' , to: '/admin/verify', target: 'nav-admin-verify' },
        { title: 'Review results', body: 'Open a sheet, then approve it, or send it back with a reason.' , to: '/admin/results', target: 'nav-admin-results' },
        { title: 'Settings', body: 'Set the school bank details, add classes and teachers, and approve access requests.' , to: '/admin/settings', target: 'nav-admin-settings' },
      ];
    case 'parent':
      return [
        { title: 'My children', body: 'See the children linked to your account and their balances.' , to: '/parent', target: 'nav-parent' },
        { title: 'Make a payment', body: 'Pay for one or more children in one transfer. Send your WhatsApp proof, then tick the box.' , to: '/parent/submit', target: 'nav-parent-submit' },
        { title: 'Receipts and statements', body: 'Download official receipts and a statement for any period.' , to: '/parent/receipts', target: 'nav-parent-receipts' },
        { title: 'Report card', body: 'See approved results for your children. Only published results appear.' , to: '/parent/report', target: 'nav-parent-report' },
      ];
    case 'teacher':
      return [
        { title: 'My home', body: 'Your classes and subjects, and requests you have sent to the Head Teacher.' , to: '/teacher', target: 'nav-teacher' },
        { title: 'Enter results', body: 'Type test and exam marks. Save a draft, or send the sheet for approval.' , to: '/teacher/results', target: 'nav-teacher-results' },
      ];
    default:
      return [];
  }
}
