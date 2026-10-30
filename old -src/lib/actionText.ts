import type { AuditEvent } from '../types';

/** Plain-English sentence for one recorded action. Unknown actions still show who and when. */
export function describeAction(e: Pick<AuditEvent, 'action' | 'details' | 'actorEmail' | 'targetId'>): string {
  const who = e.actorEmail || 'Someone';
  const d = e.details || '';
  switch (e.action) {
    case 'teacher.create': return `${who} added a teacher: ${d}.`;
    case 'teacher.update': return `${who} changed a teacher’s classes or subjects: ${d}.`;
    case 'teacherRequest.decide': return `${who} decided a teacher’s request: ${d}.`;
    case 'access.decide': return `${who} decided an account request: ${d}.`;
    case 'access.grantHeadTeacher': return `${who} gave Head Teacher access: ${d}.`;
    case 'access.removeHeadTeacher': return `${who} removed Head Teacher access: ${d}.`;
    case 'pupil.create': return `${who} added a pupil: ${d}.`;
    case 'classFees.save': return `${who} saved the standard fees for a class: ${d}.`;
    case 'resultSheet.submit': return `${who} sent results for approval: ${d}.`;
    case 'resultSheet.draft': return `${who} saved results as a draft: ${d}.`;
    case 'resultSheet.decide': return `${who} decided a result sheet: ${d}.`;
    case 'reportExtras.save': return `${who} saved stars and comments on a report card: ${d}.`;
    case 'bank.update': return `${who} changed the school bank details: ${d}.`;
    case 'statement.issue': return `${who} created a statement: ${d}.`;
    case 'childPayments.rebuild': return `${who} refreshed child payment records: ${d}.`;
    case 'payment.confirm': return `${who} confirmed a payment: ${d}.`;
    case 'payment.reject': return `${who} rejected a payment: ${d}.`;
    case 'payment.submit': return `${who} sent a payment for checking: ${d}.`;
    default: return `${who} did “${e.action}”${d ? `: ${d}` : ''}.`;
  }
}
