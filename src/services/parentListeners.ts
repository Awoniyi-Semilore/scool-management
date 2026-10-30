/**
 * Live data for the parent portal, restricted to approved pupils.
 * Firestore rules evaluate each document, so a parent must query by pupil,
 * never ask for a whole collection. Unfiltered queries are refused.
 */
import { collection, doc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { AdvanceCredit, ChildClaim, ChildPaymentRecord, Charge, ConfirmedPayment, Pupil } from '../types';

interface Setters {
  setPupils?: (v: Pupil[]) => void;
  setCharges?: (v: Charge[]) => void;
  setPayments?: (v: ConfirmedPayment[]) => void;
  setChildPayments?: (v: ChildPaymentRecord[]) => void;
  setChildClaims?: (v: ChildClaim[]) => void;
  setAdvances?: (v: AdvanceCredit[]) => void;
  fail: (e: Error) => void;
}

/** Listens to one child's records. Each collection is keyed by its document id, and replaced when a child is removed. */
export function linkedListeners(uid: string, s: Setters): Unsubscribe[] {
  const pupils = new Map<string, Pupil>();
  const charges = new Map<string, Charge>();
  const childPays = new Map<string, ChildPaymentRecord>();
  const claims = new Map<string, ChildClaim>();
  const advances = new Map<string, AdvanceCredit>();
  const perPupil = new Map<string, Unsubscribe[]>();

  const emitPupils = () => s.setPupils?.([...pupils.values()]);
  const emitCharges = () => s.setCharges?.([...charges.values()]);
  const emitChildPays = () => s.setChildPayments?.([...childPays.values()]);
  const emitClaims = () => s.setChildClaims?.([...claims.values()]);
  const emitAdvances = () => s.setAdvances?.([...advances.values()]);

  // Replace everything one child contributed to a shared map.
  function replaceFor<T extends { pupilId: string }>(map: Map<string, T>, pupilId: string, snap: { docs: { id: string; data(): unknown }[] }, make: (id: string, d: unknown) => T) {
    for (const [k, v] of map) if (v.pupilId === pupilId) map.delete(k);
    snap.docs.forEach((d) => map.set(d.id, make(d.id, d.data())));
  }

  const dropPupil = (id: string) => {
    perPupil.get(id)?.forEach((u) => u());
    perPupil.delete(id);
    pupils.delete(id);
    replaceFor(charges, id, { docs: [] }, () => ({} as Charge));
    for (const [k, v] of charges) if (v.pupilId === id) charges.delete(k);
    for (const [k, v] of childPays) if (v.pupilId === id) childPays.delete(k);
    for (const [k, v] of claims) if (v.pupilId === id) claims.delete(k);
    for (const [k, v] of advances) if (v.pupilId === id) advances.delete(k);
    emitPupils(); emitCharges(); emitChildPays(); emitClaims(); emitAdvances();
  };

  const addPupil = (id: string) => {
    const subs: Unsubscribe[] = [];
    subs.push(onSnapshot(doc(db, 'pupils', id),
      (d) => { if (d.exists()) pupils.set(id, { id: d.id, ...d.data() } as Pupil); else pupils.delete(id); emitPupils(); },
      s.fail));
    if (s.setCharges) {
      subs.push(onSnapshot(query(collection(db, 'charges'), where('pupilId', '==', id)),
        (snap) => { replaceFor(charges, id, snap, (cid, d) => ({ id: cid, ...(d as object) } as Charge)); emitCharges(); }, s.fail));
    }
    if (s.setChildPayments) {
      subs.push(onSnapshot(query(collection(db, 'childPayments'), where('pupilId', '==', id)),
        (snap) => { replaceFor(childPays, id, snap, (cid, d) => ({ id: cid, ...(d as object) } as ChildPaymentRecord)); emitChildPays(); }, s.fail));
    }
    if (s.setChildClaims) {
      subs.push(onSnapshot(query(collection(db, 'childClaims'), where('pupilId', '==', id)),
        (snap) => { replaceFor(claims, id, snap, (cid, d) => ({ id: cid, ...(d as object) } as ChildClaim)); emitClaims(); }, s.fail));
    }
    if (s.setAdvances) {
      subs.push(onSnapshot(query(collection(db, 'advanceCredits'), where('pupilId', '==', id)),
        (snap) => { replaceFor(advances, id, snap, (cid, d) => ({ id: cid, ...(d as object) } as AdvanceCredit)); emitAdvances(); }, s.fail));
    }
    perPupil.set(id, subs);
  };

  const linkSub = onSnapshot(query(collection(db, 'parentLinks'), where('parentUid', '==', uid)),
    (snap) => {
      const approved = new Set(snap.docs.map((d) => d.data()).filter((l) => l.status === 'approved').map((l) => l.pupilId as string));
      for (const id of [...perPupil.keys()]) if (!approved.has(id)) dropPupil(id);
      for (const id of approved) if (!perPupil.has(id)) addPupil(id);
      if (approved.size === 0) { emitPupils(); emitCharges(); emitChildPays(); emitClaims(); emitAdvances(); }
    }, s.fail);

  const out: Unsubscribe[] = [linkSub, () => [...perPupil.values()].flat().forEach((u) => u())];

  if (s.setPayments) {
    out.push(onSnapshot(query(collection(db, 'payments'), where('payerUid', '==', uid)),
      (snap) => s.setPayments!(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ConfirmedPayment)), s.fail));
  }
  return out;
}
