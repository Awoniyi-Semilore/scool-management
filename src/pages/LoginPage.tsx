import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Eye, EyeOff } from 'lucide-react';
import { auth, db, firebaseConfigured } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/ui';
import { useTheme } from '../context/ThemeContext';

type Picked = 'parent' | 'teacher' | 'head';

const ACCESS_DENIED = 'Access denied. Head Teacher access is given only by the Head Teacher, from Settings. It cannot be requested here.';

function friendly(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect. If you have not created an account yet, create one first.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a password of at least 6 characters.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network problem. Check your internet connection.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export default function LoginPage() {
  const { firebaseUser, role, loading } = useAuth();
  const { theme, toggle } = useTheme();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [picked, setPicked] = useState<Picked>('parent');
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const timeoutNotice = localStorage.getItem('tc.timeoutNotice');
  if (timeoutNotice) localStorage.removeItem('tc.timeoutNotice');

  if (!loading && firebaseUser && role) {
    return <Navigate to="/" replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      if (mode === 'register') {
        if (picked === 'head') throw Object.assign(new Error(), { code: 'access-denied' });
        if (!name.trim()) throw Object.assign(new Error(), { code: 'missing-name' });
        if (picked === 'parent' && !title) throw Object.assign(new Error(), { code: 'missing-title' });
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (picked === 'teacher') {
          // Only people the Head Teacher has added to the teacher list can create a teacher account.
          const onList = await getDocs(query(collection(db, 'teachers'), where('email', '==', email.trim().toLowerCase())));
          if (onList.empty) {
            await deleteUser(cred.user);
            throw Object.assign(new Error(), { code: 'not-on-teacher-list' });
          }
        }
        await updateProfile(cred.user, { displayName: picked === 'parent' ? `${title && title !== 'No title' ? `${title} ` : ''}${name.trim()}` : name.trim() });
        await sendEmailVerification(cred.user);
        setInfo(`We sent a confirmation link to ${email.trim()}. Open it, then come back and sign in.`);
        setPassword('');
      } else {
        // Remember the selected role so the portal can clearly reject access to the wrong role.
        localStorage.setItem('tc.pickedRole', picked);
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'access-denied') setError(ACCESS_DENIED);
      else if (code === 'missing-name') setError('Enter your full name.');
      else if (code === 'missing-title') setError('Choose how the school should address you.');
      else if (code === 'not-on-teacher-list') setError('Your email is not on the school’s teacher list yet. Ask the Head Teacher to add you first.');
      else setError(friendly(code));
    } finally { setBusy(false); }
  }

  async function resetPassword() {
    if (!email.trim()) { setError('Enter your email address first, then press “Forgot password”.'); return; }
    setBusy(true); setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('If an account exists for that email, a reset link has been sent. Check your inbox and spam folder.');
    } catch (err) {
      setError(friendly((err as { code?: string }).code ?? ''));
    } finally { setBusy(false); }
  }

  const roles: { key: Picked; label: string }[] = [
    { key: 'parent', label: 'Parent' },
    { key: 'teacher', label: 'Teacher' },
    { key: 'head', label: 'Head Teacher' },
  ];

  return (
    <div className="grid min-h-screen items-center gap-8 p-4 md:grid-cols-2 md:p-10">
      <div className="hero hidden min-h-[520px] flex-col justify-between md:flex">
        <div>
           <div className="flex items-center gap-4">
            <img src="/Treasure Corner Community Crest.svg" alt="Treasure Corner logo" className="h-20 w-auto" />
            <div>
              <p className="text-3xl font-bold text-white">Treasure Corner Schools</p>
              <p className="max-w-md mt-1 text-marigold-200 dark:text-marigold-500">Model for excellence and godly character</p>
            </div>
          </div>
          <h1 className="mt-10 text-4xl font-bold leading-tight text-white">School records, made simpler.</h1>
          <p className="mt-4 max-w-md text-white/85">Sign in to your account, or create one if you are new to the portal.</p>
        </div>

        <div className="mt-8 grid grid-cols-3 gap-3">
          {['Parents: view fees and submit payments', 'Teachers: enter and submit results', 'Head Teacher: review and approve'].map((t) => (
            <div key={t} className="rounded-2xl bg-white/10 p-4 text-sm text-[#f4f0ff]">{t}</div>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <button className="btn-secondary text-xs" onClick={toggle}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
        </div>
        <div className="card space-y-5">
          <div className="flex items-center gap-4">
            {/* <img src="/Treasure Corner Community Crest.svg" alt="Treasure Corner logo" className="h-20 w-auto" /> */}
            <div>
              <h2 className="text-xl font-bold text-brand-900">{mode === 'signin' ? 'Sign in to the school portal' : 'Create your account'}</h2>
              <p className="text-sm text-inkMuted">{mode === 'signin' ? 'Choose the role for your account, then enter your sign-in details.' : 'Use the email address the school has on record for you.'}</p>
            </div>
          </div>

          {timeoutNotice && <Notice kind="error">{timeoutNotice}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}
          {info && <Notice kind="success">{info}</Notice>}
          {!firebaseConfigured && <Notice kind="error">The portal is not ready yet. Please contact the school.</Notice>}

          <fieldset>
            <legend className="label">{mode === 'signin' ? 'Sign in as' : 'Create account as'}</legend>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button key={r.key} type="button" aria-pressed={picked === r.key} onClick={() => setPicked(r.key)}
                  className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold ${picked === r.key ? 'border-brand-600 bg-brand-50 text-brand-900' : 'border-line text-inkMuted'}`}>{r.label}</button>
              ))}
            </div>
            {picked === 'head' && <p className="mt-2 text-xs text-inkMuted">Head Teacher access is managed by the school. You cannot request it here.</p>}
            {mode === 'register' && picked === 'teacher' && <p className="mt-2 text-xs text-inkMuted">Your email must be on the school’s teacher list before you can create a Teacher account. Ask the Head Teacher to add it.</p>}
            {mode === 'register' && picked === 'parent' && <p className="mt-2 text-xs text-inkMuted">Choose a title so the school can address you respectfully.</p>}
          </fieldset>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-brand-50 p-1" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'signin' ? 'bg-surface shadow-sm' : 'text-inkMuted'}`}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(null); setInfo(null); }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-surface shadow-sm' : 'text-inkMuted'}`}>Create an account</button>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <>
                {picked === 'parent' && <div>
                  <label htmlFor="title" className="label">Title</label>
                  <select id="title" className="field" value={title} onChange={(e) => setTitle(e.target.value)}>
                    <option value="">Choose a title</option>
                    <option value="Mr">Mr</option><option value="Mrs">Mrs</option><option value="Miss">Miss</option><option value="Ms">Ms</option><option value="Dr">Dr</option><option value="Prof">Prof</option><option value="No title">No title</option>
                  </select>
                </div>}
                <div>
                  <label htmlFor="name" className="label">Full name</label>
                  <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              </>
            )}
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} className="field pr-24" value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button className="btn-primary w-full" disabled={busy || !firebaseConfigured}>
              {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
            </button>
          </form>

          {mode === 'signin' && (
            <button type="button" className="w-full text-sm font-semibold text-brand-700 underline" onClick={resetPassword}>Forgot password?</button>
          )}
          <p className="text-center text-sm text-inkMuted"><Link to="/" className="font-semibold text-brand-700 underline">Return to the school website</Link></p>
        </div>
      </div>
    </div>
  );
}
