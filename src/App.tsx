import { Component, type ReactNode, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { api, type User } from '@/lib/api';
import AppShell from '@/components/AppShell';
import AuthPage from '@/pages/AuthPage';
import DashboardPage from '@/pages/DashboardPage';
import BuilderPage from '@/pages/BuilderPage';
import EditorPage from '@/pages/EditorPage';
import ComponentLibraryPage from '@/pages/ComponentLibraryPage';
import ProjectsPage from '@/pages/ProjectsPage';
import ImportStudioPage from '@/pages/ImportStudioPage';
import AiProvidersPage from '@/pages/AiProvidersPage';
import ProspectsPage from '@/pages/ProspectsPage';
import ResearchPage from '@/pages/ResearchPage';
import FilesPage from '@/pages/FilesPage';
import JobsPage from '@/pages/JobsPage';
import AuditPage from '@/pages/AuditPage';
import GatewayPage from '@/pages/GatewayPage';
import MarketScanPage from '@/pages/MarketScanPage';
import ClientsPage from '@/pages/ClientsPage';
import AgentRunsPage from '@/pages/AgentRunsPage';
import AppStudioPage from '@/pages/AppStudioPage';
import BenchmarksPage from '@/pages/BenchmarksPage';
import NexusPage from '@/pages/NexusPage';
import CanvasPage from '@/pages/CanvasPage';
import AgentsPage from '@/pages/AgentsPage';
import ClawPage from '@/pages/ClawPage';
import AutoFixPage from '@/pages/AutoFixPage';
import AutoDataPage from '@/pages/AutoDataPage';
import { Button } from '@/components/ui/button';

// A page crash must never leave the user staring at a blank screen — show the
// error and a way back (previously a single render error unmounted the whole app).
class RouteErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : String(error) };
  }
  render() {
    if (this.state.message !== null) {
      return (
        <div className="space-y-4 max-w-xl">
          <h1 className="text-2xl font-bold tracking-tight">Something broke on this page</h1>
          <p className="text-sm text-muted-foreground">
            The error has been contained — the rest of the platform is unaffected. You can retry or head back.
          </p>
          <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{this.state.message}</pre>
          <div className="flex gap-2">
            <Button onClick={() => this.setState({ message: null })}>Retry</Button>
            <Button variant="outline" onClick={() => { location.href = '/dashboard'; }}>Go to dashboard</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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

  const page = (el: ReactNode) => <RouteErrorBoundary key={location.pathname}>{el}</RouteErrorBoundary>;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <AuthPage onAuth={setUser} />} />
      <Route element={user ? <AppShell user={user} onLogout={() => setUser(null)} /> : <Navigate to="/" replace />}>
        <Route path="/dashboard" element={page(<DashboardPage />)} />
        <Route path="/builder" element={page(<BuilderPage />)} />
        <Route path="/agents" element={page(<AgentRunsPage />)} />
        <Route path="/studio" element={page(<AppStudioPage />)} />
        <Route path="/benchmarks" element={page(<BenchmarksPage />)} />
        <Route path="/nexus" element={page(<NexusPage />)} />
        <Route path="/canvas" element={page(<CanvasPage />)} />
        <Route path="/canvas/:projectId" element={page(<CanvasPage />)} />
        <Route path="/agent-desk" element={page(<AgentsPage />)} />
        <Route path="/claw" element={page(<ClawPage />)} />
        <Route path="/autofix" element={page(<AutoFixPage />)} />
        <Route path="/autodata" element={page(<AutoDataPage />)} />
        <Route path="/editor" element={page(<EditorPage />)} />
        <Route path="/library" element={page(<ComponentLibraryPage />)} />
        <Route path="/scanner" element={page(<MarketScanPage />)} />
        <Route path="/projects" element={page(<ProjectsPage />)} />
        <Route path="/ai-providers" element={page(<AiProvidersPage />)} />
        <Route path="/import-studio/:projectId" element={page(<ImportStudioPage />)} />
        <Route path="/prospects" element={page(<ProspectsPage />)} />
        <Route path="/clients" element={page(<ClientsPage />)} />
        <Route path="/research" element={page(<ResearchPage />)} />
        <Route path="/files" element={page(<FilesPage />)} />
        <Route path="/jobs" element={page(<JobsPage />)} />
        <Route path="/audit" element={page(<AuditPage />)} />
        <Route path="/gateway" element={page(<GatewayPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
