import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db, firebaseConfigured } from '../lib/firebase';
import type { Role, Teacher, UserProfile } from '../types';

interface AuthState {
  firebaseUser: User | null;
  profile: UserProfile | null;
  profileError: string | null;
  role: Role | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const IDLE_MS = 30 * 60 * 1000;          // signed out after 30 minutes without activity
const MAX_MS = 12 * 60 * 60 * 1000;      // and never longer than 12 hours in one sign-in
const SIGNED_AT = 'tc.signedInAt';
const LAST_ACTIVE = 'tc.lastActive';

/**
 * Creates the profile the first time a verified person signs in.
 * - A person on the school's teacher list becomes a Teacher, with exactly the classes and subjects the Head Teacher gave them.
 * - Everyone else becomes a Parent. Nobody can create an admin profile.
 * - An unverified email gets no profile, so the portal stays closed until the link is clicked.
 */
async function loadOrCreateProfile(user: User): Promise<UserProfile | null> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as UserProfile;
  if (!user.emailVerified) return null;

  const email = (user.email ?? '').toLowerCase();
  const onTeacherList = await getDocs(query(collection(db, 'teachers'), where('email', '==', email)));
  if (!onTeacherList.empty) {
    const t = { id: onTeacherList.docs[0].id, ...onTeacherList.docs[0].data() } as Teacher;
    const profile: UserProfile = {
      uid: user.uid, email, displayName: t.fullName, role: 'teacher', createdAt: Date.now(),
      teaching: { classIds: t.classIds, subjects: t.subjects },
    };
    await setDoc(ref, profile);
    return profile;
  }
  const profile: UserProfile = {
    uid: user.uid, email, displayName: user.displayName ?? user.email ?? 'Parent', role: 'parent', createdAt: Date.now(),
  };
  await setDoc(ref, profile);
  return profile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!auth.currentUser) return;
    try {
      setProfile(await loadOrCreateProfile(auth.currentUser));
      setProfileError(null);
    } catch (e) {
      setProfile(null);
      setProfileError((e as Error).message);
    }
  };

  useEffect(() => {
    if (!firebaseConfigured) { setLoading(false); return; }
    return onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshProfile();
      } else {
        setProfile(null);
        setProfileError(null);
      }
      setLoading(false);
    });
  }, []);

  // Session limits: sign out after 30 minutes idle, or after 12 hours in one sign-in.
  useEffect(() => {
    if (!firebaseUser) return;
    if (!localStorage.getItem(SIGNED_AT)) localStorage.setItem(SIGNED_AT, String(Date.now()));
    const bump = () => localStorage.setItem(LAST_ACTIVE, String(Date.now()));
    bump();
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const check = () => {
      const now = Date.now();
      const idle = now - Number(localStorage.getItem(LAST_ACTIVE) ?? now);
      const age = now - Number(localStorage.getItem(SIGNED_AT) ?? now);
      if (idle > IDLE_MS || age > MAX_MS) {
        localStorage.setItem('tc.timeoutNotice', idle > IDLE_MS ? 'You were signed out after 30 minutes without activity.' : 'For your security you were signed out after 12 hours. Sign in again.');
        clearSession();
        signOut(auth);
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(timer); };
  }, [firebaseUser]);

  const logout = async () => {
    clearSession();
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, profileError, role: profile?.role ?? null, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

function clearSession() {
  localStorage.removeItem(SIGNED_AT);
  localStorage.removeItem(LAST_ACTIVE);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
