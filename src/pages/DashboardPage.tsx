import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Stats = {
  projects: number; files: number; jobs: number; checkpoints: number; prospects: number;
  researchRuns: number; auditEvents: number; artifacts: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [gateway, setGateway] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api('/projects'), api('/files'), api('/jobs'), api('/prospects'), api('/research'), api('/audit'),
    ]).then(([p, f, j, pr, r, a]) => {
      setStats({
        projects: p.projects.length, files: f.files.length, jobs: j.jobs.length,
        prospects: pr.prospects.length, researchRuns: r.runs.length, auditEvents: a.events.length,
        checkpoints: 0, artifacts: 0,
      });
    }).catch(() => {});
    api('/gateway/status').then(setGateway).catch(() => {});
  }, []);

  const items = stats ? [
    { label: 'Projects', value: stats.projects },
    { label: 'Generated artifacts', value: '—' },
    { label: 'Sandbox jobs', value: stats.jobs },
    { label: 'Files stored', value: stats.files },
    { label: 'Prospects (CRM)', value: stats.prospects },
    { label: 'Research runs', value: stats.researchRuns },
    { label: 'Audit events', value: stats.auditEvents },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Your sovereign platform at a glance.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((it) => (
          <Card key={it.label}>
            <CardHeader className="pb-2"><CardDescription>{it.label}</CardDescription></CardHeader>
            <CardContent><div className="text-3xl font-bold">{it.value}</div></CardContent>
          </Card>
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
              <div className="flex items-center gap-2">
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
