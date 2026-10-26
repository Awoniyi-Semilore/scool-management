import { useState } from 'react';
import { updateProfile, sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from '../../lib/firebase';
import { PageHeader, Notice } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export default function ParentAccount() {
  const { profile, firebaseUser, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!firebaseConfigured || !firebaseUser || !profile) return <Notice kind="error">Account details are unavailable.</Notice>;

  async function saveName() {
    setBusy(true); setMsg(null);
    try {
      if (!name.trim()) throw new Error('Enter your name.');
      await updateProfile(firebaseUser!, { displayName: name.trim() });
      await updateDoc(doc(db, 'users', firebaseUser!.uid), { displayName: name.trim() });
      await refreshProfile();
      setMsg({ kind: 'success', text: 'Your name has been updated.' });
    } catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function changePassword() {
    setBusy(true); setMsg(null);
    try {
      if (newPw.length < 6) throw new Error('Choose a password of at least 6 characters.');
      await updatePassword(auth.currentUser!, newPw);
      setNewPw('');
      setMsg({ kind: 'success', text: 'Password changed.' });
    } catch (e) {
      const code = (e as { code?: string }).code;
      setMsg({ kind: 'error', text: code === 'auth/requires-recent-login' ? 'For security, sign out and sign in again before changing your password.' : (e as Error).message });
    }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="My Account" subtitle="Your details and sign-in settings." />
      {msg && <div className="mb-4"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold">Your details</h2>
          <div><label className="label" htmlFor="acc-name">Full name</label><input id="acc-name" className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <p className="text-sm text-inkMuted">Email: {profile.email}</p>
          <button className="btn-primary" disabled={busy} onClick={saveName}>Save name</button>
        </div>
        <div className="card space-y-3">
          <h2 className="font-semibold">Change password</h2>
          <div><label className="label" htmlFor="acc-pw">New password</label><input id="acc-pw" type="password" className="field" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy} onClick={changePassword}>Change password</button>
            <button className="btn-secondary" disabled={busy} onClick={async () => {
              try { await sendPasswordResetEmail(auth, profile.email); setMsg({ kind: 'success', text: 'A reset link has been sent to your email.' }); }
              catch (e) { setMsg({ kind: 'error', text: (e as Error).message }); }
            }}>Email me a reset link</button>
          </div>
        </div>
      </div>
    </>
  );
}
