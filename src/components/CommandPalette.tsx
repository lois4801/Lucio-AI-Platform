import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import { NAV_SECTIONS } from '@/lib/nav';
import { LogOut, ScanSearch, Hammer } from 'lucide-react';
import { api } from '@/lib/api';

// Global ⌘K / Ctrl+K palette: jump to any surface, plus the most common
// actions. Mounted once in AppShell; triggered by header search buttons via
// the 'lucio:open-palette' window event (see lib/palette.ts).
export default function CommandPalette({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onCustom = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('lucio:open-palette', onCustom);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('lucio:open-palette', onCustom);
    };
  }, []);

  const go = useCallback((to: string) => {
    setOpen(false);
    navigate(to);
  }, [navigate]);

  const signOut = useCallback(async () => {
    setOpen(false);
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* session may already be gone */ }
    onLogout();
    navigate('/');
  }, [navigate, onLogout]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump to any page or run a quick action">
      <CommandInput placeholder="Type a page or action…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Quick actions">
          <CommandItem onSelect={() => go('/scanner')}>
            <ScanSearch className="h-4 w-4" />
            <span>New market scan</span>
          </CommandItem>
          <CommandItem onSelect={() => go('/builder')}>
            <Hammer className="h-4 w-4" />
            <span>Build a website</span>
          </CommandItem>
          <CommandItem onSelect={signOut}>
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {NAV_SECTIONS.map((section) => (
          <CommandGroup key={section.title} heading={section.title}>
            {section.items.map(({ to, label, icon: Icon, keywords }) => (
              <CommandItem key={to} value={`${label} ${keywords}`} onSelect={() => go(to)}>
                <Icon className="h-4 w-4" />
                <span>{label}</span>
                <CommandShortcut>{to}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
