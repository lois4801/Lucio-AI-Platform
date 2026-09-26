import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { api, type User } from '@/lib/api';
import AppShell from '@/components/AppShell';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';
import BuilderPage from '@/pages/BuilderPage';
import ProjectsPage from '@/pages/ProjectsPage';
import ProspectsPage from '@/pages/ProspectsPage';
import ResearchPage from '@/pages/ResearchPage';
import FilesPage from '@/pages/FilesPage';
import JobsPage from '@/pages/JobsPage';
import AuditPage from '@/pages/AuditPage';
import GatewayPage from '@/pages/GatewayPage';
import MarketScanPage from '@/pages/MarketScanPage';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: User }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Starting Lucio…</div>;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage onAuth={setUser} />} />
      <Route element={user ? <AppShell user={user} onLogout={() => setUser(null)} /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/scanner" element={<MarketScanPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/prospects" element={<ProspectsPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/files" element={<FilesPage />} />
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/gateway" element={<GatewayPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
