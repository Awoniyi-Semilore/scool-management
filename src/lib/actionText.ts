import type { AuditEvent } from '../types';
import { formatNaira } from './money';

export interface ActionNames {
  parentName?: string;
  pupilName?: string;
}

export interface ActionReference {
  parentUid?: string;
  pupilId: string;
}

const isStoredPupilId = (value: string) => /^[A-Za-z0-9]{20}$/.test(value);
const isStoredUserId = (value: string) => /^[A-Za-z0-9]{28}$/.test(value);

export function legacyActionReference(e: Pick<AuditEvent, 'action' | 'details'>): ActionReference | null {
  if (e.action === 'link.approved') {
    const match = e.details.match(/^Linked parent (\S+) to pupil (\S+)$/);
    return match && isStoredUserId(match[1]) && isStoredPupilId(match[2])
      ? { parentUid: match[1], pupilId: match[2] }
      : null;
  }
  if (e.action.startsWith('charge.')) {
    const match = e.details.match(/^.+ kobo for pupil ([A-Za-z0-9]{20})$/);
    return match && isStoredPupilId(match[1]) ? { pupilId: match[1] } : null;
  }
  return null;
}

/** Plain-English sentence for one recorded action. Unknown actions still show who and when. */
export function describeAction(e: Pick<AuditEvent, 'action' | 'details' | 'actorEmail' | 'targetId'>, names?: ActionNames): string {
  const who = e.actorEmail || 'Someone';
  let d = e.details || '';
  const charge = e.action.startsWith('charge.')
    ? d.match(/^(fee|discount|opening_balance) (\d+|₦[\d,]+(?:\.\d{2})?)(?: kobo)? for pupil (.+)$/)
    : null;
  if (charge) {
    const amount = charge[2].includes('₦') ? charge[2] : formatNaira(Number(charge[2]));
    const pupilName = names?.pupilName || charge[3];
    const kind = charge[1] === 'opening_balance' ? 'opening balance' : charge[1];
    d = `${kind} of ${amount} for ${pupilName}`;
  } else if (names?.parentName && names.pupilName && e.action === 'link.approved') {
    d = d.replace(/^Linked parent \S+ to pupil \S+$/, `Linked parent ${names.parentName} to pupil ${names.pupilName}`);
  }
  switch (e.action) {
    case 'charge.fee': return `${who} added a fee of ${d.replace(/^fee of /, '')}.`;
    case 'charge.discount': return `${who} applied a discount of ${d.replace(/^discount of /, '')}.`;
    case 'charge.opening_balance': return `${who} recorded an opening balance of ${d.replace(/^opening balance of /, '')}.`;
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
