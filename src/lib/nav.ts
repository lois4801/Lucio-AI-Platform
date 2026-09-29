// Shared navigation model — consumed by the AppShell sidebar/drawer and the
// ⌘K command palette, so both always stay in sync.
import {
  LayoutDashboard, Hammer, FolderKanban, Radar, Search, Files, TerminalSquare, ScrollText,
  Cpu, ScanSearch, BriefcaseBusiness, Blocks, PencilRuler, Bot, AppWindow, Gauge, Rocket,
  BotMessageSquare, Code, Wrench, Database, Sparkles, Frame, type LucideIcon,
} from 'lucide-react';

export type NavItem = { to: string; label: string; icon: LucideIcon; keywords: string };
export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, keywords: 'home overview stats' },
    ],
  },
  {
    title: 'Find',
    items: [
      { to: '/scanner', label: 'Market Scanner', icon: ScanSearch, keywords: 'map scan leads discovery businesses' },
      { to: '/prospects', label: 'Prospects', icon: Radar, keywords: 'crm leads agency pipeline' },
      { to: '/research', label: 'Research', icon: Search, keywords: 'research reports' },
      { to: '/autodata', label: 'Auto Data', icon: Database, keywords: 'data engine verticals content packs' },
    ],
  },
  {
    title: 'Build',
    items: [
      { to: '/builder', label: 'App Builder', icon: Hammer, keywords: 'build website create' },
      { to: '/nexus', label: 'NEXUS Builder', icon: Rocket, keywords: 'nexus runs agents build' },
      { to: '/canvas', label: 'Canvas', icon: Frame, keywords: 'canvas layers visual' },
      { to: '/studio', label: 'App Studio', icon: AppWindow, keywords: 'studio apps' },
      { to: '/editor', label: 'Website Editor', icon: PencilRuler, keywords: 'edit site content' },
      { to: '/library', label: 'Component Library', icon: Blocks, keywords: 'components sections registry' },
      { to: '/benchmarks', label: 'Benchmarks', icon: Gauge, keywords: 'benchmarks performance quality' },
      { to: '/autofix', label: 'Auto-Fix', icon: Wrench, keywords: 'fix repair audit' },
      { to: '/claw', label: 'Claw Coder', icon: Code, keywords: 'claw coder ai coding agent' },
    ],
  },
  {
    title: 'Sell',
    items: [
      { to: '/clients', label: 'Clients & Sites', icon: BriefcaseBusiness, keywords: 'clients deals billing live sites portal' },
      { to: '/projects', label: 'Projects', icon: FolderKanban, keywords: 'projects templates imports' },
    ],
  },
  {
    title: 'Agents',
    items: [
      { to: '/agents', label: 'Agent Runs', icon: Bot, keywords: 'agent runs history' },
      { to: '/agent-desk', label: 'AI Agents', icon: BotMessageSquare, keywords: 'agents directory chat specialists' },
    ],
  },
  {
    title: 'Platform',
    items: [
      { to: '/files', label: 'Files', icon: Files, keywords: 'files storage artifacts' },
      { to: '/jobs', label: 'Sandbox Jobs', icon: TerminalSquare, keywords: 'jobs sandbox queue' },
      { to: '/audit', label: 'Audit Log', icon: ScrollText, keywords: 'audit events log' },
      { to: '/gateway', label: 'Model Gateway', icon: Cpu, keywords: 'gateway models runtime' },
      { to: '/ai-providers', label: 'AI Providers', icon: Sparkles, keywords: 'providers api keys byok' },
    ],
  },
];

export const NAV_FLAT: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);
