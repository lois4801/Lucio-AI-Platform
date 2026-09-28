import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import CreationModePicker, { buildCreationPayload, defaultCreationOptions, type CreationOptions } from '@/components/CreationModePicker';

type Project = { id: string; name: string; app_type: string; status: string; active_checkpoint_id: string | null; brief: any };
type Run = { id: string; status: string; intent: string; candidate: string; error: string | null };
type Ev = { seq: number; type: string; actor: string; payload: any };
type FileRow = { path: string; hash: string; size: number };
type Cp = { id: string; label: string; namespace: string; manifest_hash: string; created_at: string };
type EvRow = { category: string; check_name: string; status: string; detail: string; mandatory: number };

export default function NexusPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [intent, setIntent] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null);
  const [checkpoints, setCheckpoints] = useState<Cp[]>([]);
  const [evidence, setEvidence] = useState<EvRow[]>([]);
  const [competition, setCompetition] = useState(false);
  const [creation, setCreation] = useState<CreationOptions>(defaultCreationOptions());
  const [comparison, setComparison] = useState<any[]>([]);
  const [shareUrl, setShareUrl] = useState('');
  const [deployUrl, setDeployUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [cpLabel, setCpLabel] = useState('');
  const [showCp, setShowCp] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const loadProjects = () => api('/nexus/projects').then((r) => setProjects(r.projects)).catch((e) => setMsg(e.message));
  useEffect(() => { loadProjects(); }, []);

  const openProject = async (p: Project) => {
    setActive(p); setMsg(''); setShareUrl(''); setDeployUrl('');
    const detail = await api(`/nexus/projects/${p.id}`);
    setFiles(detail.files); setCheckpoints(detail.checkpoints);
    const r = await api(`/nexus/projects/${p.id}/runs`);
    setRuns(r.runs);
    setRun(r.runs[0] || null);
    if (r.runs[0]) loadEvents(r.runs[0].id, r.runs[0].status);
    const cmp = await api(`/nexus/projects/${p.id}/comparison`).catch(() => ({ comparison: [] }));
    setComparison(cmp.comparison || []);
  };

  const loadEvents = async (runId: string, status?: string) => {
    sseRef.current?.close();
    const r = await api(`/nexus/runs/${runId}/events.json`);
    setEvents(r.events || []);
    if (status && !['completed', 'failed', 'blocked', 'cancelled'].includes(status)) {
      const es = new EventSource(`/api/nexus/runs/${runId}/events`);
      es.onmessage = (m) => setEvents((prev) => [...prev, JSON.parse(m.data)]);
      sseRef.current = es;
    }
    const ev = await api(`/nexus/runs/${runId}/evidence`).catch(() => ({ evidence: [] }));
    setEvidence(ev.evidence || []);
  };

  const refreshFiles = async () => {
    if (!active) return;
    const r = await api(`/nexus/projects/${active.id}/files`);
    setFiles(r.files);
    const d = await api(`/nexus/projects/${active.id}`);
    setCheckpoints(d.checkpoints);
  };

  const startRun = async () => {
    if (!active || !intent.trim()) return;
    setMsg(''); setEvents([]); setEvidence([]);
    try {
      const r = await api(`/nexus/projects/${active.id}/runs`, { method: 'POST', body: JSON.stringify({ intent, competition, creation: buildCreationPayload(creation) }) });
      const newRuns = competition ? r.runs : [r.run];
      setRuns((prev) => [...newRuns, ...prev]);
      setRun(newRuns[0]);
      await loadEvents(newRuns[0].id, newRuns[0].status);
      await refreshFiles();
      const cmp = await api(`/nexus/projects/${active.id}/comparison`).catch(() => ({ comparison: [] }));
      setComparison(cmp.comparison || []);
      setIntent('');
    } catch (err: any) { setMsg(err.message); }
  };

  const createProject = async () => {
    setMsg('');
    const name = newName.trim();
    if (!name) return;
    try {
      const r = await api('/nexus/projects', { method: 'POST', body: JSON.stringify({ name, appType: 'website' }) });
      setNewName(''); setShowNew(false);
      await loadProjects();
      openProject(r.project);
    } catch (err: any) { setMsg(err.message); }
  };

  const makeCheckpoint = async () => {
    if (!active) return;
    const label = cpLabel.trim() || 'manual';
    await api(`/nexus/projects/${active.id}/checkpoints`, { method: 'POST', body: JSON.stringify({ label }) });
    setCpLabel(''); setShowCp(false);
    await refreshFiles();
  };
  const restore = async (cp: Cp) => {
    if (!active) return;
    await api(`/nexus/checkpoints/${cp.id}/restore`, { method: 'POST', body: JSON.stringify({ projectId: active.id }) });
    await refreshFiles(); setMsg(`Restored checkpoint ${cp.label}`);
  };
  const share = async (cp: Cp) => {
    if (!active) return;
    const r = await api(`/nexus/projects/${active.id}/share`, { method: 'POST', body: JSON.stringify({ checkpointId: cp.id }) });
    setShareUrl(window.location.origin + r.share.url);
  };
  const deploy = async (cp: Cp) => {
    if (!active) return;
    try {
      const r = await api(`/nexus/projects/${active.id}/deploy`, { method: 'POST', body: JSON.stringify({ checkpointId: cp.id }) });
      setDeployUrl(window.location.origin + r.deployment.url);
      setMsg(`Deployed: ${r.deployment.url}`);
    } catch (err: any) { setMsg(err.message); }
  };
  const selectWinner = async (runId: string) => {
    if (!active) return;
    try {
      await api('/nexus/competition/select', { method: 'POST', body: JSON.stringify({ projectId: active.id, runId }) });
      setMsg('Winner selected — working tree restored to that checkpoint.');
      await refreshFiles();
    } catch (err: any) { setMsg(err.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NEXUS Builder</h1>
          <p className="text-muted-foreground">Your AI builds it: the ChatGPT / Claude / Kimi keys you configured in AI Providers write the plan and the actual site — with deterministic evidence gates at every step, and template fallback when no AI is configured.</p>
        </div>
        {showNew ? (
          <div className="flex gap-2 items-center">
            <Input autoFocus className="w-64" placeholder="Project name" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createProject(); if (e.key === 'Escape') { setShowNew(false); setNewName(''); } }} />
            <Button onClick={createProject} disabled={!newName.trim()}>Create</Button>
            <Button variant="outline" onClick={() => { setShowNew(false); setNewName(''); }}>Cancel</Button>
          </div>
        ) : (
          <Button onClick={() => setShowNew(true)}>New project</Button>
        )}
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        {projects.map((p) => (
          <Card key={p.id} className={active?.id === p.id ? 'border-primary' : 'cursor-pointer'} onClick={() => openProject(p)}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{p.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{p.app_type} · {p.status}</CardDescription></CardHeader>
          </Card>
        ))}
        {projects.length === 0 && <p className="text-sm text-muted-foreground">No builder projects yet — create one.</p>}
      </div>

      {active && (
        <>
          <Card>
            <CardHeader><CardTitle>Build from a prompt</CardTitle>
              <CardDescription>One intent → your AI writes the brief and the full site → deterministic evidence suite → immutable checkpoint. The choices matrix (creation mode, locked LD style, motion level) is applied as real generation parameters. Competition mode asks your AI for two independent candidates and lets you pick the winner.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input className="flex-1 min-w-64" placeholder="e.g. A SaaS landing page for a Kingston fitness studio called Iron Harbour with pricing" value={intent} onChange={(e) => setIntent(e.target.value)} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={competition} onChange={(e) => setCompetition(e.target.checked)} /> Competition (2 candidates)
                </label>
                {run && ['building', 'testing', 'repairing', 'planning', 'checkpointing'].includes(run.status) && (
                  <Button variant="outline" onClick={async () => { await api(`/nexus/runs/${run.id}/cancel`, { method: 'POST' }); setMsg('Cancel requested'); }}>Cancel run</Button>
                )}
              </div>
              <CreationModePicker value={creation} onChange={setCreation} busy={!!run && ['building', 'testing', 'repairing', 'planning', 'checkpointing'].includes(run.status)} disabled={!intent.trim()} generateLabel="Build" onGenerate={startRun} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Build timeline {run && <Badge className="ml-2">{run.status}{run.candidate !== 'main' ? ` · ${run.candidate}` : ''}</Badge>}</CardTitle></CardHeader>
              <CardContent>
                <div className="max-h-72 overflow-y-auto space-y-1 text-xs font-mono">
                  {events.map((e) => (
                    <div key={e.seq} className="flex gap-2">
                      <span className="text-muted-foreground w-8 shrink-0">{e.seq}</span>
                      <span className={`shrink-0 ${e.type.startsWith('ai.') ? 'text-green-600 dark:text-green-400 font-bold' : 'text-accent'}`}>{e.type}</span>
                      <span className="truncate">{e.payload?.message || e.payload?.path || e.payload?.reason || e.payload?.provider || e.payload?.summary || e.payload?.taskId || ''}</span>
                    </div>
                  ))}
                  {events.length === 0 && <p className="text-muted-foreground">No events yet — run a build.</p>}
                </div>
                {evidence.length > 0 && (
                  <div className="mt-4 space-y-1 text-xs">
                    <div className="font-semibold text-sm">Evidence</div>
                    {evidence.map((e, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <Badge variant={e.status === 'pass' ? 'default' : 'destructive'}>{e.status}</Badge>
                        <span>{e.check_name}</span>
                        <span className="text-muted-foreground truncate">{e.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Live preview</CardTitle>
                <CardDescription>Sandboxed iframe — generated apps run with no network and no access to the Lucio control plane.</CardDescription></CardHeader>
              <CardContent>
                {files.some((f) => f.path === 'index.html') ? (
                  <iframe title="preview" sandbox="allow-scripts" className="w-full h-72 rounded-md border bg-white" src={`/api/nexus/projects/${active.id}/preview/index.html`} />
                ) : <p className="text-sm text-muted-foreground">Build the project to get a preview.</p>}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle>Files</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {files.map((f) => (
                  <button key={f.path} className="block w-full text-left font-mono text-xs hover:text-accent" onClick={async () => setOpenFile((await api(`/nexus/projects/${active.id}/files/${f.path}`)).file)}>
                    {f.path} <span className="text-muted-foreground">({(f.size / 1024).toFixed(1)} KB)</span>
                  </button>
                ))}
                {openFile && (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md border p-2 text-xs bg-muted">{openFile.content.slice(0, 4000)}</pre>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Checkpoints</CardTitle>
                <CardDescription>Immutable manifests — restore never loses the pre-restore state.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {checkpoints.map((cp) => (
                  <div key={cp.id} className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs">{cp.label}</span>
                    <Badge variant="secondary">{cp.namespace}</Badge>
                    <Button size="sm" variant="outline" onClick={() => restore(cp)}>Restore</Button>
                    <Button size="sm" variant="outline" onClick={() => share(cp)}>Share</Button>
                    <Button size="sm" variant="outline" onClick={() => deploy(cp)}>Deploy</Button>
                    <a className="text-xs text-accent underline" href={`/api/nexus/checkpoints/${cp.id}/export?projectId=${active.id}`}>ZIP</a>
                  </div>
                ))}
                {showCp ? (
                  <div className="flex gap-2 items-center">
                    <Input autoFocus className="w-48" placeholder="Checkpoint label" value={cpLabel}
                      onChange={(e) => setCpLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') makeCheckpoint(); if (e.key === 'Escape') { setShowCp(false); setCpLabel(''); } }} />
                    <Button size="sm" onClick={makeCheckpoint} disabled={!cpLabel.trim()}>Save</Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowCp(false); setCpLabel(''); }}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setShowCp(true)}>+ Checkpoint</Button>
                )}
                {shareUrl && <p className="text-xs break-all">Share: {shareUrl}</p>}
                {deployUrl && <p className="text-xs break-all">Deployed: <a className="text-accent underline" href={deployUrl} target="_blank" rel="noreferrer">{deployUrl}</a></p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Competition</CardTitle>
                <CardDescription>Same evidence suite for every candidate — you pick the winner.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {comparison.length === 0 && <p className="text-muted-foreground">Run a competition build to compare candidates.</p>}
                {comparison.map((c) => (
                  <div key={c.runId} className="rounded-md border p-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge>{c.candidate}</Badge>
                      <span className="font-mono text-xs">{c.status}</span>
                      {c.mandatoryFailures === 0 && c.status === 'completed' && (
                        <Button size="sm" onClick={() => selectWinner(c.runId)}>Select winner</Button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      mandatory failures: {c.mandatoryFailures} · files: {c.files.count} ({(c.files.bytes / 1024).toFixed(1)} KB) · events: {c.events}
                    </div>
                    <div className="text-xs">{Object.entries(c.evidence || {}).map(([k, v]: any) => `${k}:${v.pass}p/${v.fail}f`).join(' · ')}</div>
                  </div>
                ))}
                {runs.filter((r) => r.candidate !== 'main').length > 0 && (
                  <div className="text-xs text-muted-foreground">Runs: {runs.filter((r) => r.candidate !== 'main').map((r) => r.candidate).join(', ')}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
