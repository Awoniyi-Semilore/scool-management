import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { legacyActionReference, type ActionNames } from '../lib/actionText';
import type { AuditEvent, Pupil, UserProfile } from '../types';

/** Resolve names for legacy audit entries that stored parent or pupil IDs in their details. */
export async function resolveActionNames(events: AuditEvent[]): Promise<Record<string, ActionNames>> {
  const refs = events.flatMap((event) => {
    const ref = legacyActionReference(event);
    return ref ? [{ eventId: event.id, ...ref }] : [];
  });
  const uniquePupils = [...new Set(refs.map((ref) => ref.pupilId))];
  const uniqueParents = [...new Set(refs.flatMap((ref) => ref.parentUid ? [ref.parentUid] : []))];
  const [pupils, parents] = await Promise.all([
    Promise.all(uniquePupils.map(async (id) => {
      const snap = await getDoc(doc(db, 'pupils', id));
      if (!snap.exists()) return [id, 'Pupil record unavailable'] as const;
      const pupil = snap.data() as Pupil;
      const name = `${pupil.firstName} ${pupil.lastName}`.trim();
      return [id, name || 'Pupil name unavailable'] as const;
    })),
    Promise.all(uniqueParents.map(async (id) => {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) return [id, 'Parent record unavailable'] as const;
      const parent = snap.data() as UserProfile;
      const name = parent.displayName?.trim() || parent.email;
      return [id, name || 'Parent name unavailable'] as const;
    })),
  ]);
  const pupilNames = Object.fromEntries(pupils);
  const parentNames = Object.fromEntries(parents);
  return Object.fromEntries(refs.map((ref) => [ref.eventId, {
    pupilName: pupilNames[ref.pupilId],
    ...(ref.parentUid ? { parentName: parentNames[ref.parentUid] } : {}),
  }]));
}
