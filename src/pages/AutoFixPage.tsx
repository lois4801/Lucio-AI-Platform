import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Incident = {
  id: string; project_id: string; type: string; error: string; file: string; severity: string;
  status: string; attempts: number; claw_job_id: string | null; summary: string; created_at: string;
  events?: { seq: number; actor: string; payload: any; created_at: string }[];
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  fixed: 'default', open: 'secondary', fixing: 'secondary', awaiting_approval: 'outline',
  escalated: 'destructive', with_claw: 'outline', dismissed: 'outline',
};

export default function AutoFixPage() {
  const [mode, setMode] = useState('ask-first');
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [selected, setSelected] = useState<Incident | null>(null);
  const [raw, setRaw] = useState('');
  const [clawJobStatus, setClawJobStatus] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    api('/autofix/incidents').then((r) => setIncidents(r.incidents)).catch((e) => setMsg(e.message));
    api('/autofix/mode').then((r) => setMode(r.mode)).catch(() => {});
  };
  useEffect(() => { load(); api('/nexus/projects').then((r) => setProjects(r.projects)).catch(() => {}); }, []);

  // Poll the selected incident's claw job status while it runs.
  useEffect(() => {
    if (selected?.status !== 'with_claw' || !selected.claw_job_id) return;
    const t = setInterval(() => {
      api(`/claw/jobs/${selected.claw_job_id}`).then((r) => setClawJobStatus(r.job.status)).catch(() => {});
    }, 1500);
    return () => clearInterval(t);
  }, [selected?.status, selected?.claw_job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn: () => Promise<any>) => {
    try { setMsg(''); await fn(); load(); if (selected) setSelected((await api(`/autofix/incidents/${selected.id}`)).incident); }
    catch (e: any) { setMsg(e.message); }
  };
  const report = () => act(async () => {
    await api('/autofix/incidents', { method: 'POST', body: JSON.stringify({ projectId, source: 'manual', raw }) });
    setRaw('');
  });

  const openDetail = async (i: Incident) => setSelected((await api(`/autofix/incidents/${i.id}`)).incident);

  return (
    <div className="p-6 space-y-4 max-w-[1300px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Multi-Agent Auto-Fix</h1>
          <p className="text-muted-foreground">Watcher → Triager → Specialist → Verifier → Guardian. Mechanical failures are fixed and verified automatically; anything else escalates — or dispatches to Claw Coder.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Mode</label>
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={mode} onChange={(e) => act(() => api('/autofix/mode', { method: 'PUT', body: JSON.stringify({ mode: e.target.value }) }))}>
            <option value="off">off</option>
            <option value="ask-first">ask-first</option>
            <option value="auto">auto</option>
          </select>
        </div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Report an incident</CardTitle>
          <CardDescription>Paste a build error, console error, or failing check — the Watcher structures and dedupes it. Blocked NEXUS runs also arrive here automatically.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Input placeholder="e.g. GET /api/orders 500 — styles.css missing (404)" value={raw} onChange={(e) => setRaw(e.target.value)} className="flex-1" />
            <Button onClick={report} disabled={!projectId || !raw.trim()}>Report</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Incidents</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {incidents.length === 0 && <p className="text-xs text-muted-foreground">No incidents yet — they appear here when builds fail or you report one.</p>}
            {incidents.map((i) => (
              <button key={i.id} className={`w-full text-left rounded-md border p-2 text-sm hover:border-primary ${selected?.id === i.id ? 'border-primary' : ''}`} onClick={() => openDetail(i)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{i.error}</span>
                  <Badge variant={STATUS_VARIANT[i.status] || 'secondary'}>{i.status}</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {i.type} · {i.severity} · attempts {i.attempts} · {i.created_at}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selected ? 'Incident detail' : 'Select an incident'}</CardTitle>
            {selected && <CardDescription>{selected.file && `file: ${selected.file} · `}{selected.id.slice(0, 8)}</CardDescription>}
          </CardHeader>
          {selected && (
            <CardContent className="space-y-3">
              {selected.summary && <p className="text-sm rounded-md bg-muted/40 p-2">{selected.summary}</p>}
              {selected.status === 'with_claw' && (
                <p className="text-xs text-muted-foreground">Claw job {selected.claw_job_id?.slice(0, 8)} — status: {clawJobStatus || '…'}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {['open'].includes(selected.status) && <Button size="sm" onClick={() => act(() => api(`/autofix/incidents/${selected.id}/run`, { method: 'POST' }))}>Run fix loop</Button>}
                {selected.status === 'awaiting_approval' && <Button size="sm" onClick={() => act(() => api(`/autofix/incidents/${selected.id}/approve`, { method: 'POST' }))}>Approve & apply</Button>}
                {['open', 'escalated', 'awaiting_approval'].includes(selected.status) && <Button size="sm" variant="secondary" onClick={() => act(() => api(`/autofix/incidents/${selected.id}/dispatch-claw`, { method: 'POST' }))}>Dispatch to Claw</Button>}
                {selected.status === 'with_claw' && clawJobStatus === 'completed' && <Button size="sm" onClick={() => act(() => api(`/autofix/incidents/${selected.id}/apply-claw`, { method: 'POST', body: JSON.stringify({ jobId: selected.claw_job_id }) }))}>Apply Claw result</Button>}
                {['open', 'awaiting_approval', 'with_claw'].includes(selected.status) && <Button size="sm" variant="ghost" onClick={() => act(() => api(`/autofix/incidents/${selected.id}/dismiss`, { method: 'POST' }))}>Dismiss</Button>}
              </div>
              <div className="rounded-md border max-h-[300px] overflow-y-auto">
                {(selected.events || []).map((e) => (
                  <div key={e.seq} className="px-3 py-1.5 text-xs border-b last:border-0">
                    <span className="font-medium">{e.actor}</span>{' '}
                    <span className="text-muted-foreground">{summarize(e.payload)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

function summarize(p: any): string {
  try {
    if (p.fixed) return `fixed — files: ${(p.files || []).join(', ')}`;
    if (p.approved === false) return `guardian blocked — ${p.reason || ''}`;
    if (p.approved === 'pending-owner') return 'fix staged — waiting for owner approval (ask-first mode)';
    if (p.approved === true) return 'owner approved — applying';
    if (p.dispatched === 'claw') return `dispatched to Claw Coder (job ${String(p.jobId || '').slice(0, 8)})`;
    if (p.rollback) return `rolled back — ${p.reason}`;
    if (p.verdict) return `verdict ${p.verdict}: ${p.evidence}`;
    if (p.route) return `confirmed → routed to ${p.route}: ${p.hypothesis}`;
    if (p.confirmed === false) return `dismissed — ${p.reason}`;
    if (p.dismissed) return `dismissed by owner — ${p.reason || ''}`;
    if (p.type) return `watcher: ${p.type}/${p.severity}${p.file ? ` (${p.file})` : ''}`;
    return JSON.stringify(p).slice(0, 140);
  } catch { return ''; }
}
