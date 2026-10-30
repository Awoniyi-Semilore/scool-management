import type { Role } from '../types';

export interface TourStep { title: string; body: string; to: string; target: string }

/** Short tour per role. Each role sees only the steps for pages it can use. */
export function tourSteps(role: Role | null): TourStep[] {
  switch (role) {
    case 'admin':
      return [
        { title: 'Overview', body: 'See payments that need checking, results that need review, and your school’s current fee totals.', to: '/admin', target: 'nav-admin' },
        { title: 'Fee register', body: 'Choose a class and pupil to review fees, add a charge, or record a payment.', to: '/admin/register', target: 'nav-admin-register' },
        { title: 'Verify payments', body: 'Compare each submitted transfer with the bank record. Confirm matching payments; otherwise, reject the submission and explain why. Only confirmed payments update balances and create receipts.', to: '/admin/verify', target: 'nav-admin-verify' },
        { title: 'Review results', body: 'Check each results sheet. Approve it or return it to the teacher with a reason.', to: '/admin/results', target: 'nav-admin-results' },
        { title: 'Settings', body: 'Set bank details, manage classes and teachers, and review access requests.', to: '/admin/settings', target: 'nav-admin-settings' },
      ];
    case 'parent':
      return [
        { title: 'My children', body: 'View the children linked to your account and their current balances.', to: '/parent', target: 'nav-parent' },
        { title: 'Make a payment', body: 'Select the fees to pay, transfer the money to the school, then submit the transfer details. Your balance changes after the school confirms the payment. If it is rejected, the school will explain what to correct.', to: '/parent/submit', target: 'nav-parent-submit' },
        { title: 'Receipts and statements', body: 'Download receipts for confirmed payments or create an account statement for a selected period.', to: '/parent/receipts', target: 'nav-parent-receipts' },
        { title: 'Report card', body: 'View your children’s results after the school approves and publishes them.', to: '/parent/report', target: 'nav-parent-report' },
      ];
    case 'teacher':
      return [
        { title: 'My home', body: 'View your assigned classes and subjects, and check requests you have sent to the Head Teacher.', to: '/teacher', target: 'nav-teacher' },
        { title: 'Enter results', body: 'Enter test and exam marks. Save your work as a draft or send it for approval.', to: '/teacher/results', target: 'nav-teacher-results' },
      ];
    default:
      return [];
  }
}
