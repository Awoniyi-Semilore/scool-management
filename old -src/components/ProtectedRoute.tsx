import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../types';
import { Loading, Notice } from './ui';
import { firebaseConfigured } from '../lib/firebase';

/**
 * UI-level guard for navigation only. Real access control is enforced by
 * firestore.rules and storage.rules; this guard just avoids showing screens
 * that would fail anyway.
 */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { firebaseUser, profile, loading } = useAuth();
  if (!firebaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Notice kind="error">Firebase is not configured. Copy .env.example to .env.local and add your Firebase values, then restart the dev server.</Notice>
      </div>
    );
  }
  if (loading) return <div className="p-6"><Loading text="Checking your session…" /></div>;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!profile) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Notice kind="error">We could not load your profile. Check your connection and try again, or ask the head teacher to check your account.</Notice>
      </div>
    );
  }
  if (profile.role !== role) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
