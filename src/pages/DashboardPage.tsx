import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { api, type User } from '@/lib/api';
import { notifyError } from '@/lib/notify';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FolderKanban, Radar, BriefcaseBusiness, ScanSearch, Hammer, ArrowRight,
  Files, TerminalSquare, Search, ScrollText,
} from 'lucide-react';

type Stats = {
  projects: number; files: number; jobs: number; prospects: number;
  researchRuns: number; auditEvents: number;
};

type Gateway = { activeLabel: string; externalEnabled: number };

export default function DashboardPage() {
  const { user } = useOutletContext<{ user: User }>();
  const [stats, setStats] = useState<Stats | null>(null);
  const [gateway, setGateway] = useState<Gateway | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ projects: unknown[] }>('/projects'),
      api<{ files: unknown[] }>('/files'),
      api<{ jobs: unknown[] }>('/jobs'),
      api<{ prospects: unknown[] }>('/prospects'),
      api<{ runs: unknown[] }>('/research'),
      api<{ events: unknown[] }>('/audit'),
    ]).then(([p, f, j, pr, r, a]) => {
      setStats({
        projects: p.projects.length, files: f.files.length, jobs: j.jobs.length,
        prospects: pr.prospects.length, researchRuns: r.runs.length, auditEvents: a.events.length,
      });
    }).catch((e) => notifyError(e, 'Loading workspace stats'));
    api<Gateway>('/gateway/status').then(setGateway).catch((e) => notifyError(e, 'Loading gateway status'));
  }, []);

  const firstName = user.name.split(' ')[0];
  const fresh = stats !== null && stats.projects === 0 && stats.prospects === 0;

  const items = [
    { label: 'Projects', value: stats?.projects, icon: FolderKanban, to: '/projects' },
    { label: 'Prospects (CRM)', value: stats?.prospects, icon: Radar, to: '/prospects' },
    { label: 'Sandbox jobs', value: stats?.jobs, icon: TerminalSquare, to: '/jobs' },
    { label: 'Files stored', value: stats?.files, icon: Files, to: '/files' },
    { label: 'Research runs', value: stats?.researchRuns, icon: Search, to: '/research' },
    { label: 'Audit events', value: stats?.auditEvents, icon: ScrollText, to: '/audit' },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back, {firstName}</h1>
        <p className="text-muted-foreground">Your sovereign platform at a glance.</p>
      </div>

      {/* Primary workflow: find → build → sell */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { step: '1 · Find', title: 'Scan a market', body: 'Drop a pin, find businesses with no website.', to: '/scanner', icon: ScanSearch },
          { step: '2 · Build', title: 'Build the site', body: 'One click: plan, design universe, live preview.', to: '/builder', icon: Hammer },
          { step: '3 · Sell', title: 'Close the deal', body: 'Live links, owner portal, deals and billing.', to: '/clients', icon: BriefcaseBusiness },
        ].map((a) => (
          <Link key={a.to} to={a.to}
            className="group rounded-xl border bg-card p-4 sm:p-5 transition-all hover:shadow-md hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">{a.step}</span>
              <a.icon className="h-4 w-4 text-muted-foreground transition-transform group-hover:scale-110" />
            </div>
            <div className="mt-2 font-semibold">{a.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{a.body}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      {fresh && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-semibold">Your workspace is empty — start with a scan</div>
              <p className="text-sm text-muted-foreground">The scanner finds local businesses with no website and turns each one into a buildable opportunity.</p>
            </div>
            <Button asChild className="min-h-11">
              <Link to="/scanner"><ScanSearch className="h-4 w-4 mr-2" /> Run your first scan</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {items.map((it) => (
          <Link key={it.label} to={it.to} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <it.icon className="h-3.5 w-3.5" /> {it.label}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl sm:text-3xl font-bold tabular-nums">{it.value ?? '—'}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Model gateway</CardTitle>
          <CardDescription>Active runtime and provider posture.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {gateway ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-green-600">Sovereign</Badge>
                <span className="font-medium">{gateway.activeLabel}</span>
              </div>
              <p className="text-muted-foreground">
                External AI providers enabled: {gateway.externalEnabled}. Core workflows run without any paid API.
              </p>
            </>
          ) : <p className="text-muted-foreground">Loading…</p>}
        </CardContent>
      </Card>
    </div>
  );
}
