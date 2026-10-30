import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Shell } from './components/Shell';
import { Loading } from './components/ui';
import LoginPage from './pages/LoginPage';
import WelcomePage from './pages/WelcomePage';
import { WaitingPage, NotApprovedPage, VerifyEmailPage, ProfileProblem } from './pages/AccessPages';
const TeacherHomePage = lazy(() => import('./pages/teacher/TeacherHome'));
const TeacherResultsPage = lazy(() => import('./pages/teacher/TeacherResults'));
const ReviewResultsPage = lazy(() => import('./pages/admin/ReviewResults'));
const AdminStatementsPage = lazy(() => import('./pages/admin/Statements'));
const ParentStatementsPage = lazy(() => import('./pages/parent/ParentStatements'));
const ParentReportPage = lazy(() => import('./pages/parent/ParentReport'));
const ActionsPage = lazy(() => import('./pages/ActionsPage'));
const ReportReviewPage = lazy(() => import('./pages/admin/ReportReview'));
const TeacherCommentsPage = lazy(() => import('./pages/teacher/TeacherComments'));
const ApprovalsPage = lazy(() => import('./pages/admin/Approvals'));
const TeachersPage = lazy(() => import('./pages/admin/Teachers'));
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'));
const FeeRegister = lazy(() => import('./pages/admin/FeeRegister'));
const VerifyPayments = lazy(() => import('./pages/admin/VerifyPayments'));
const PupilsPage = lazy(() => import('./pages/admin/PupilsPage'));
const ClassesPage = lazy(() => import('./pages/admin/ClassesPage'));
const ReceiptsReports = lazy(() => import('./pages/admin/ReceiptsReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const ParentChildren = lazy(() => import('./pages/parent/ParentChildren'));
const ParentFees = lazy(() => import('./pages/parent/ParentFees'));
const ParentSubmitPayment = lazy(() => import('./pages/parent/ParentSubmitPayment'));
const ParentReceipts = lazy(() => import('./pages/parent/ParentReceipts'));
const ParentAccount = lazy(() => import('./pages/parent/ParentAccount'));

const TEACHER_NAV = [
  { to: '/teacher', label: 'My home' },
  { to: '/teacher/results', label: 'Enter results' },
  { to: '/teacher/comments', label: 'Report card comments' },
  { to: '/teacher/actions', label: 'Actions' },
];

const ADMIN_NAV = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/register', label: 'Fee Register' },
  { to: '/admin/verify', label: 'Review payments' },
  { to: '/admin/pupils', label: 'Pupils' },
  { to: '/admin/classes', label: 'Classes' },
  { to: '/admin/reports', label: 'Receipts and reports' },
  { to: '/admin/results', label: 'Review results' },
  { to: '/admin/statements', label: 'Statements' },
  { to: '/admin/report-review', label: 'Report review' },
  { to: '/admin/teachers', label: 'Teachers' },
  { to: '/admin/approvals', label: 'Approvals' },
  { to: '/admin/actions', label: 'Actions' },
  { to: '/admin/settings', label: 'Settings' },
];

const PARENT_NAV = [
  { to: '/parent', label: 'My Children' },
  { to: '/parent/fees', label: 'Fees and balances' },
  { to: '/parent/submit', label: 'Make a payment' },
  { to: '/parent/receipts', label: 'Receipts' },
  { to: '/parent/statements', label: 'Statements' },
  { to: '/parent/report', label: 'Report cards' },
  { to: '/parent/actions', label: 'Actions' },
  { to: '/parent/account', label: 'My account' },
];

const HOME: Record<string, string> = { admin: '/admin', parent: '/parent', teacher: '/teacher' };

function Home() {
  const { role, loading, firebaseUser, profile, profileError, logout } = useAuth();
  if (loading) return <div className="p-6"><Loading /></div>;
  if (!firebaseUser) return <WelcomePage />;
  if (!profile) {
    if (!firebaseUser.emailVerified) return <VerifyEmailPage />;
    return <ProfileProblem message={profileError} onLogout={() => logout()} />;
  }
  if (!role) return <Navigate to="/login" replace />;
  if (profile.requestStatus === 'pending') return <Navigate to="/waiting" replace />;
  // Sign-in role picker: if the person picked a role their account is not approved for, say so clearly.
  const picked = localStorage.getItem('tc.pickedRole');
  const approvedFor: Record<string, string> = { parent: 'parent', head: 'admin', teacher: 'teacher' };
  if (picked && approvedFor[picked] && approvedFor[picked] !== role) return <Navigate to="/not-approved" replace />;
  return <Navigate to={HOME[role] ?? '/parent'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="p-8"><Loading /></div>}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/waiting" element={<WaitingPage />} />
      <Route path="/not-approved" element={<NotApprovedPage />} />

      <Route element={<ProtectedRoute role="admin"><Shell nav={ADMIN_NAV} title="Head Teacher" /></ProtectedRoute>}>
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/register" element={<FeeRegister />} />
        <Route path="/admin/verify" element={<VerifyPayments />} />
        <Route path="/admin/pupils" element={<PupilsPage />} />
        <Route path="/admin/classes" element={<ClassesPage />} />
        <Route path="/admin/reports" element={<ReceiptsReports />} />
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin/results" element={<ReviewResultsPage />} />
        <Route path="/admin/statements" element={<AdminStatementsPage />} />
        <Route path="/admin/report" element={<ReportReviewPage />} />
        <Route path="/admin/report-review" element={<ReportReviewPage />} />
        <Route path="/admin/teachers" element={<TeachersPage />} />
        <Route path="/admin/approvals" element={<ApprovalsPage />} />
        <Route path="/admin/actions" element={<ActionsPage />} />
      </Route>

      <Route element={<ProtectedRoute role="parent"><Shell nav={PARENT_NAV} title="Parent / Guardian" /></ProtectedRoute>}>
        <Route path="/parent" element={<ParentChildren />} />
        <Route path="/parent/fees" element={<ParentFees />} />
        <Route path="/parent/submit" element={<ParentSubmitPayment />} />
        <Route path="/parent/receipts" element={<ParentReceipts />} />
        <Route path="/parent/statements" element={<ParentStatementsPage />} />
        <Route path="/parent/report" element={<ParentReportPage />} />
        <Route path="/parent/actions" element={<ActionsPage />} />
        <Route path="/parent/account" element={<ParentAccount />} />
      </Route>

      <Route element={<ProtectedRoute role="teacher"><Shell nav={TEACHER_NAV} title="Teacher" /></ProtectedRoute>}>
        <Route path="/teacher" element={<TeacherHomePage />} />
        <Route path="/teacher/results" element={<TeacherResultsPage />} />
        <Route path="/teacher/comments" element={<TeacherCommentsPage />} />
        <Route path="/teacher/actions" element={<ActionsPage />} />
      </Route>


      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
