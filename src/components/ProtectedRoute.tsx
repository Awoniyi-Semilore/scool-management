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
        <Notice kind="error">The portal is not ready yet. Contact the school administrator for help.</Notice>
      </div>
    );
  }
  if (loading) return <div className="p-6"><Loading text="Checking your session…" /></div>;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (!profile) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <Notice kind="error">We could not load your account details. Check your internet connection and try again. If the problem continues, contact the Head Teacher.</Notice>
      </div>
    );
  }
  if (profile.role !== role) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
