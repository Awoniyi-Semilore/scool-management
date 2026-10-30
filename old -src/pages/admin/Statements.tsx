import { useEffect, useState } from 'react';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Loading, Notice } from '../../components/ui';
import StatementPanel from '../../components/StatementPanel';
import type { AdvanceCredit, Charge, ChildClaim, ChildPaymentRecord, Pupil } from '../../types';

export default function AdminStatements() {
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [records, setRecords] = useState<ChildPaymentRecord[] | null>(null);
  const [claims, setClaims] = useState<ChildClaim[] | null>(null);
  const [advances, setAdvances] = useState<AdvanceCredit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const fail = (e: Error) => setError(e.message);
    const unsubs: Unsubscribe[] = [
      onSnapshot(collection(db, 'pupils'), (s) => setPupils(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Pupil)), fail),
      onSnapshot(collection(db, 'charges'), (s) => setCharges(s.docs.map((d) => ({ id: d.id, ...d.data() }) as Charge)), fail),
      onSnapshot(collection(db, 'childPayments'), (s) => setRecords(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ChildPaymentRecord)), fail),
      onSnapshot(collection(db, 'childClaims'), (s) => setClaims(s.docs.map((d) => ({ id: d.id, ...d.data() }) as ChildClaim)), fail),
      onSnapshot(collection(db, 'advanceCredits'), (s) => setAdvances(s.docs.map((d) => ({ id: d.id, ...d.data() }) as AdvanceCredit)), fail),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!pupils || !charges || !records || !claims || !advances) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader title="Account statements" subtitle="One statement per child. Each shows who paid what. Transfers not yet confirmed are listed separately." />
      <StatementPanel pupils={[...pupils].sort((a, b) => a.lastName.localeCompare(b.lastName))} charges={charges} records={records} claims={claims} advances={advances} mode="admin" />
    </div>
  );
}
