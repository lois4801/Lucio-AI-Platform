import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { LogOut, Menu, Search } from 'lucide-react';
import AssistantPanel from '@/components/AssistantPanel';
import CommandPalette from '@/components/CommandPalette';
import { openCommandPalette } from '@/lib/palette';
import { NAV_SECTIONS } from '@/lib/nav';

function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {section.title}
          </div>
          <div className="space-y-0.5">
            {section.items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/60'}`
                }>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div>
      <div className="text-2xl font-extrabold">Lucio<span className="text-primary">.</span></div>
      <div className="text-xs text-muted-foreground mt-1">Sovereign AI Platform</div>
    </div>
  );
}

function AccountBlock({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">Sovereign engine</Badge>
      </div>
      <div className="text-sm font-medium truncate">{user.name}</div>
      <div className="text-xs text-muted-foreground truncate">{user.email}</div>
      <Badge className="capitalize">{user.role}</Badge>
      <Button variant="outline" size="sm" className="w-full gap-2 min-h-11" onClick={onLogout}>
        <LogOut className="h-3.5 w-3.5" /> Sign out
      </Button>
    </div>
  );
}

export default function AppShell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    onLogout();
    navigate('/');
  };
  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r bg-sidebar flex-col sticky top-0 h-screen">
        <div className="p-5 pb-3">
          <Brand />
        </div>
        <div className="px-3 pb-2">
          <button
            onClick={openCommandPalette}
            className="flex w-full items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">⌘K</kbd>
          </button>
        </div>
        <Separator />
        <NavSections />
        <Separator />
        <AccountBlock user={user} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar flex flex-col" aria-describedby={undefined}>
          <SheetHeader className="p-5 pb-3 text-left">
            <SheetTitle asChild><Brand /></SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
          </SheetHeader>
          <Separator />
          <NavSections onNavigate={() => setDrawerOpen(false)} />
          <Separator />
          <AccountBlock user={user} onLogout={logout} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 h-14"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="text-lg font-extrabold">Lucio<span className="text-primary">.</span></div>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={openCommandPalette} aria-label="Search and quick actions">
            <Search className="h-5 w-5" />
          </Button>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
            <Outlet context={{ user }} />
          </div>
        </main>
      </div>

      <AssistantPanel />
      <CommandPalette onLogout={onLogout} />
    </div>
  );
}
