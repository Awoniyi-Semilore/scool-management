import { useState } from 'react';
import { reload, sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/ui';

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4">
        <img src="/treasure-corner-logo-compact.svg" alt="Treasure Corner logo" className="mx-auto h-20 w-auto" />
        <h1 className="text-center text-xl font-bold text-brand-900">{title}</h1>
        {children}
        <button className="btn-secondary w-full" onClick={() => { localStorage.removeItem('tc.pickedRole'); logout(); }}>Sign in with a different account</button>
      </div>
    </div>
  );
}

/** Shown while a teacher or staff request waits for the head teacher. */
export function WaitingPage() {
  return (
    <Frame title="Waiting for approval">
      <Notice kind="success">Your request has been sent to the Head Teacher. You will be able to sign in with this role once it is approved.</Notice>
    </Frame>
  );
}

/** Shown when a person picks a role their account is not approved for. */
export function NotApprovedPage() {
  const picked = localStorage.getItem('tc.pickedRole');
  const label = picked === 'head' ? 'Head Teacher' : picked === 'teacher' ? 'Teacher' : 'that role';
  return (
    <Frame title="Not approved for this role">
      <Notice kind="error">This account is not approved as {label}. Sign in as Parent, or ask the Head Teacher to approve your {label} access.</Notice>
    </Frame>
  );
}

/** Shown until the person clicks the link Firebase emailed them. */
export function VerifyEmailPage() {
  const { firebaseUser, logout, refreshProfile } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function resend() {
    if (!firebaseUser) return;
    setBusy(true); setMsg(null);
    try {
      await sendEmailVerification(firebaseUser);
      setMsg('We sent the link again. Check your inbox and spam folder.');
    } catch (e) {
      setMsg((e as Error).message);
    } finally { setBusy(false); }
  }
  async function checkNow() {
    if (!firebaseUser) return;
    setBusy(true); setMsg(null);
    try {
      await reload(firebaseUser);
      if (firebaseUser.emailVerified) await refreshProfile();
      else setMsg('Not confirmed yet. Open the link in the email first, then press this again.');
    } finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4">
        <h1 className="text-center text-xl font-bold text-brand-900">Confirm your email</h1>
        <p className="text-sm text-inkMuted">We sent a link to <b>{firebaseUser?.email}</b>. Open it to confirm your email. This protects your account: nobody can enter the portal without access to this inbox.</p>
        {msg && <Notice kind="success">{msg}</Notice>}
        <button className="btn-primary w-full" disabled={busy} onClick={checkNow}>I have confirmed my email</button>
        <button className="btn-secondary w-full" disabled={busy} onClick={resend}>Send the link again</button>
        <button className="btn-secondary w-full" onClick={() => logout()}>Sign in with a different account</button>
      </div>
    </div>
  );
}

/** Shown when a signed-in account cannot be given a profile, for example an email not on the teacher list. */
export function ProfileProblem({ message, onLogout }: { message: string | null; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4">
        <h1 className="text-center text-xl font-bold text-brand-900">This account cannot open the portal</h1>
        <Notice kind="error">{message ?? 'Your account could not be set up. Ask the school for help.'}</Notice>
        <button className="btn-secondary w-full" onClick={onLogout}>Sign in with a different account</button>
      </div>
    </div>
  );
}
