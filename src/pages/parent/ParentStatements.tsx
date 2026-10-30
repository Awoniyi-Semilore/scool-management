import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { linkedListeners } from '../../services/parentListeners';
import { PageHeader, Loading, Notice } from '../../components/ui';
import StatementPanel from '../../components/StatementPanel';
import type { AdvanceCredit, Charge, ChildClaim, ChildPaymentRecord, Pupil } from '../../types';

export default function ParentStatements() {
  const { firebaseUser } = useAuth();
  const [pupils, setPupils] = useState<Pupil[] | null>(null);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [records, setRecords] = useState<ChildPaymentRecord[] | null>(null);
  const [claims, setClaims] = useState<ChildClaim[] | null>(null);
  const [advances, setAdvances] = useState<AdvanceCredit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    const unsubs = linkedListeners(firebaseUser.uid, {
      setPupils, setCharges, setChildPayments: setRecords, setChildClaims: setClaims, setAdvances, fail: (e) => setError(e.message),
    });
    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!pupils || !charges || !records || !claims || !advances) return <Loading />;
  return (
    <div className="space-y-5">
      <PageHeader title="Account statements" subtitle="Create a statement for each linked child. All guardians linked to the same child see the same account figures." />
      <StatementPanel pupils={pupils} charges={charges} records={records} claims={claims} advances={advances} mode="parent" />
    </div>
  );
}
