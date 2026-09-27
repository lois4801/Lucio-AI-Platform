import { NavLink, Outlet, useNavigate } from 'react-router';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, Hammer, FolderKanban, Radar, Search, Files, TerminalSquare, ScrollText,
  Cpu, LogOut, ScanSearch, BriefcaseBusiness, Blocks, PencilRuler, Bot, AppWindow, Gauge, Rocket, BotMessageSquare, Code } from 'lucide-react';
import AssistantPanel from '@/components/AssistantPanel';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/builder', label: 'App Builder', icon: Hammer },
  { to: '/agents', label: 'Agent Runs', icon: Bot },
  { to: '/studio', label: 'App Studio', icon: AppWindow },
  { to: '/benchmarks', label: 'Benchmarks', icon: Gauge },
  { to: '/nexus', label: 'NEXUS Builder', icon: Rocket },
  { to: '/agent-desk', label: 'AI Agents', icon: BotMessageSquare },
  { to: '/claw', label: 'Claw Coder', icon: Code },
  { to: '/editor', label: 'Website Editor', icon: PencilRuler },
  { to: '/library', label: 'Component Library', icon: Blocks },
  { to: '/scanner', label: 'Market Scanner', icon: ScanSearch },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/prospects', label: 'Agency OS · Prospects', icon: Radar },
  { to: '/clients', label: 'Clients & Sites', icon: BriefcaseBusiness },
  { to: '/research', label: 'Research', icon: Search },
  { to: '/files', label: 'Files', icon: Files },
  { to: '/jobs', label: 'Sandbox Jobs', icon: TerminalSquare },
  { to: '/audit', label: 'Audit Log', icon: ScrollText },
  { to: '/gateway', label: 'Model Gateway', icon: Cpu },
];

export default function AppShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch {}
    onLogout();
    navigate('/');
  };
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r bg-sidebar flex flex-col">
        <div className="p-5">
          <div className="text-2xl font-extrabold">Lucio<span className="text-primary">.</span></div>
          <div className="text-xs text-muted-foreground mt-1">Sovereign AI Platform</div>
        </div>
        <Separator />
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`
              }>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </nav>
        <Separator />
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Sovereign engine</Badge>
          </div>
          <div className="text-sm font-medium truncate">{user.name}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          <Badge className="capitalize">{user.role}</Badge>
          <Button variant="outline" size="sm" className="w-full gap-2" onClick={logout}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-6xl mx-auto">
          <Outlet context={{ user }} />
        </div>
      </main>
      <AssistantPanel />
    </div>
  );
}
