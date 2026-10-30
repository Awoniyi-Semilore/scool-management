import { useState } from 'react';
import { reload, sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/ui';

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4">
        <img src="/Treasure Corner Community Crest.svg" alt="Treasure Corner logo" className="mx-auto h-20 w-auto" />
        <h1 className="text-center text-xl font-bold text-brand-900">{title}</h1>
        {children}
        <button className="btn-secondary w-full" onClick={() => { localStorage.removeItem('tc.pickedRole'); logout(); }}>Sign out and use a different account</button>
      </div>
    </div>
  );
}

/** Shown while a teacher or staff request waits for the head teacher. */
export function WaitingPage() {
  return (
    <Frame title="Waiting for approval">
      <Notice kind="success">Your request is with the Head Teacher. You can use this role after it is approved.</Notice>
    </Frame>
  );
}

/** Shown when a person picks a role their account is not approved for. */
export function NotApprovedPage() {
  const picked = localStorage.getItem('tc.pickedRole');
  const label = picked === 'head' ? 'Head Teacher' : picked === 'teacher' ? 'Teacher' : picked === 'parent' ? 'Parent / Guardian' : 'that role';
  return (
    <Frame title="Not approved for this role">
      <Notice kind="error">This account does not have access to {label}. Choose the role linked to your account, or ask the Head Teacher to review your access.</Notice>
    </Frame>
  );
}

/** Shown until the person clicks the link Firebase emailed them. */
export function VerifyEmailPage() {
  const { firebaseUser, logout, refreshProfile } = useAuth();
  const [msg, setMsg] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function resend() {
    if (!firebaseUser) return;
    setBusy(true); setMsg(null);
    try {
      await sendEmailVerification(firebaseUser);
      setMsg({ kind: 'success', text: 'We sent a new verification link. Check your inbox and spam folder.' });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally { setBusy(false); }
  }
  async function checkNow() {
    if (!firebaseUser) return;
    setBusy(true); setMsg(null);
    try {
      await reload(firebaseUser);
      if (firebaseUser.emailVerified) await refreshProfile();
      else setMsg({ kind: 'info', text: 'Your email is not verified yet. Open the link in the email, then check again.' });
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message });
    } finally { setBusy(false); }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4">
        <h1 className="text-center text-xl font-bold text-brand-900">Verify your email address</h1>
        <p className="text-sm text-inkMuted">Open the verification link we sent to <b>{firebaseUser?.email}</b>. You need to verify this address before you can use the portal.</p>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn-primary w-full" disabled={busy} onClick={checkNow}>I verified my email</button>
        <button className="btn-secondary w-full" disabled={busy} onClick={resend}>Resend verification link</button>
        <button className="btn-secondary w-full" onClick={() => logout()}>Sign out and use a different account</button>
      </div>
    </div>
  );
}

/** Shown when a signed-in account cannot be given a profile, for example an email not on the teacher list. */
export function ProfileProblem({ message, onLogout }: { message: string | null; onLogout: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-4">
        <h1 className="text-center text-xl font-bold text-brand-900">We could not set up your account</h1>
        <Notice kind="error">{message ?? 'Your account could not be set up. Contact the school for help.'}</Notice>
        <button className="btn-secondary w-full" onClick={onLogout}>Sign out and use a different account</button>
      </div>
    </div>
  );
}
