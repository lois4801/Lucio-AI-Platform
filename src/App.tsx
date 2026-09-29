import { Component, Suspense, lazy, type ReactNode, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { api, type User } from '@/lib/api';
import AppShell from '@/components/AppShell';
import AuthPage from '@/pages/AuthPage';
import { Button } from '@/components/ui/button';

// Route-level code splitting: the scanner, builder and NEXUS surfaces are heavy
// (Leaflet, editors, charts) — lazy chunks keep first paint fast on any device.
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const BuilderPage = lazy(() => import('@/pages/BuilderPage'));
const EditorPage = lazy(() => import('@/pages/EditorPage'));
const ComponentLibraryPage = lazy(() => import('@/pages/ComponentLibraryPage'));
const ProjectsPage = lazy(() => import('@/pages/ProjectsPage'));
const ImportStudioPage = lazy(() => import('@/pages/ImportStudioPage'));
const AiProvidersPage = lazy(() => import('@/pages/AiProvidersPage'));
const ProspectsPage = lazy(() => import('@/pages/ProspectsPage'));
const ResearchPage = lazy(() => import('@/pages/ResearchPage'));
const FilesPage = lazy(() => import('@/pages/FilesPage'));
const JobsPage = lazy(() => import('@/pages/JobsPage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));
const GatewayPage = lazy(() => import('@/pages/GatewayPage'));
const MarketScanPage = lazy(() => import('@/pages/MarketScanPage'));
const ClientsPage = lazy(() => import('@/pages/ClientsPage'));
const AgentRunsPage = lazy(() => import('@/pages/AgentRunsPage'));
const AppStudioPage = lazy(() => import('@/pages/AppStudioPage'));
const BenchmarksPage = lazy(() => import('@/pages/BenchmarksPage'));
const NexusPage = lazy(() => import('@/pages/NexusPage'));
const CanvasPage = lazy(() => import('@/pages/CanvasPage'));
const AgentsPage = lazy(() => import('@/pages/AgentsPage'));
const ClawPage = lazy(() => import('@/pages/ClawPage'));
const AutoFixPage = lazy(() => import('@/pages/AutoFixPage'));
const AutoDataPage = lazy(() => import('@/pages/AutoDataPage'));

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

function PageLoading() {
  return (
    <div className="grid place-items-center py-24 text-sm text-muted-foreground">Loading…</div>
  );
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

  const page = (el: ReactNode) => (
    <RouteErrorBoundary key={location.pathname}>
      <Suspense fallback={<PageLoading />}>{el}</Suspense>
    </RouteErrorBoundary>
  );

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
