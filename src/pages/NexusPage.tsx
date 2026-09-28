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
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editStale, setEditStale] = useState(false);
  const [gh, setGh] = useState<{ repo: string; branch: string; maskedPat: string; updatedAt: string } | null>(null);
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');
  const [ghPat, setGhPat] = useState('');
  const [ghDiff, setGhDiff] = useState<{ added: string[]; removed: string[]; changed: string[]; identical: number; repo: string; branch: string } | null>(null);
  const [ghBusy, setGhBusy] = useState('');
  const [scanUrl, setScanUrl] = useState('');
  const [scanProposal, setScanProposal] = useState<any>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [backend, setBackend] = useState<{ appId: string; token: string; endpoint: string; recordCount: number; fields: any[] } | null>(null);
  const [metrics, setMetrics] = useState<{ roles: any[]; evidence: Record<string, { pass: number; fail: number }>; totals: any } | null>(null);
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
    const conn = await api(`/nexus/projects/${p.id}/git/connection`).catch(() => ({ connection: null }));
    setGh(conn.connection);
    if (conn.connection) { setGhRepo(conn.connection.repo); setGhBranch(conn.connection.branch); }
    setGhDiff(null);
    setScanProposal(null); setScanUrl('');
    const be = await api(`/nexus/projects/${p.id}/backend`).catch(() => ({ backend: null }));
    setBackend(be.backend);
    const m = await api('/nexus/agent-metrics').catch(() => ({ metrics: null }));
    setMetrics(m.metrics);
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
    const m = await api('/nexus/agent-metrics').catch(() => ({ metrics: null }));
    setMetrics(m.metrics);
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

  // ---- file editor (Phase 10) ----------------------------------------------------------------
  const openForEdit = async (path: string) => {
    if (!active) return;
    const f = (await api(`/nexus/projects/${active.id}/files/${path}`)).file;
    setOpenFile(f); setEditContent(f.content); setEditing(true); setEditStale(false);
  };
  const saveFile = async () => {
    if (!active || !openFile || editBusy) return;
    setEditBusy(true); setMsg('');
    try {
      const r = await api(`/nexus/projects/${active.id}/files`, { method: 'PATCH', body: JSON.stringify({ ops: [{ op: 'update', path: openFile.path, content: editContent }] }) });
      setEditStale(!!r.lddStale);
      setOpenFile({ ...openFile, content: editContent });
      setEditing(false);
      await refreshFiles();
    } catch (err: any) { setMsg(err.message); }
    finally { setEditBusy(false); }
  };

  // ---- GitHub loop (Phase 10) ----------------------------------------------------------------
  const ghConnect = async () => {
    if (!active || ghBusy) return;
    setGhBusy('connect'); setMsg('');
    try {
      const r = await api(`/nexus/projects/${active.id}/git/connect`, { method: 'POST', body: JSON.stringify({ repo: ghRepo.trim(), branch: ghBranch.trim() || 'main', pat: ghPat }) });
      setGh(r.connection); setGhPat('');
      setMsg(`GitHub connected: ${r.connection.repo}@${r.connection.branch}`);
    } catch (err: any) { setMsg(err.message); }
    finally { setGhBusy(''); }
  };
  const ghForget = async () => {
    if (!active || ghBusy) return;
    setGhBusy('forget'); setMsg('');
    try {
      await api(`/nexus/projects/${active.id}/git/connection`, { method: 'DELETE' });
      setGh(null); setGhDiff(null);
    } catch (err: any) { setMsg(err.message); }
    finally { setGhBusy(''); }
  };
  const ghDo = async (action: 'diff' | 'pull' | 'sync') => {
    if (!active || ghBusy) return;
    setGhBusy(action); setMsg('');
    try {
      if (action === 'diff') {
        const r = await api(`/nexus/projects/${active.id}/git/diff`, { method: 'POST', body: JSON.stringify({}) });
        setGhDiff(r.diff);
      } else if (action === 'pull') {
        const r = await api(`/nexus/projects/${active.id}/git/pull`, { method: 'POST', body: JSON.stringify({}) });
        setMsg(`Pulled ${r.pull.pulled.length} file(s) from ${r.pull.repo}@${r.pull.branch}${r.pull.checkpointId ? ` — checkpoint ${r.pull.checkpointId.slice(0, 8)}` : ''}.`);
        setGhDiff(null);
        await refreshFiles();
      } else {
        const cpId = active.active_checkpoint_id || checkpoints[0]?.id;
        if (!cpId) { setMsg('No checkpoint yet — build or save one first.'); return; }
        const r = await api(`/nexus/projects/${active.id}/git/sync`, { method: 'POST', body: JSON.stringify({ checkpointId: cpId }) });
        setMsg(`Synced ${r.sync.synced.length} file(s) to ${r.sync.repo}@${r.sync.branch}.`);
      }
    } catch (err: any) { setMsg(err.message); }
    finally { setGhBusy(''); }
  };

  // ---- site form backend (Phase 12) -------------------------------------------------------------
  const enableBackend = async () => {
    if (!active) return;
    setMsg('');
    try {
      const r = await api(`/nexus/projects/${active.id}/backend`, { method: 'POST', body: JSON.stringify({}) });
      setBackend(r.backend);
      setMsg(`Form backend live — ${r.backend.fields.length} field(s) captured from the site's forms.`);
    } catch (err: any) { setMsg(err.message); }
  };
  const runScan = async () => {
    if (!active || scanBusy || !scanUrl.trim()) return;
    setScanBusy(true); setMsg(''); setScanProposal(null);
    try {
      const r = await api(`/nexus/projects/${active.id}/design/scan`, { method: 'POST', body: JSON.stringify({ url: scanUrl.trim() }) });
      setScanProposal(r.proposal);
    } catch (err: any) { setMsg(err.message); }
    finally { setScanBusy(false); }
  };
  const applyScan = async () => {
    if (!active || !scanProposal || scanBusy) return;
    setScanBusy(true); setMsg('');
    try {
      const r = await api(`/nexus/projects/${active.id}/design/apply`, { method: 'POST', body: JSON.stringify({ url: scanProposal.url, tokens: scanProposal.proposedTokens }) });
      setMsg(`Design tokens applied from ${scanProposal.url} — re-rendered ${r.files} file(s), checkpoint ${r.checkpointId?.slice(0, 8)}.`);
      setScanProposal(null);
      await refreshFiles();
    } catch (err: any) { setMsg(err.message); }
    finally { setScanBusy(false); }
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

          <div className="grid gap-6 lg:grid-cols-4">
            <Card>
              <CardHeader><CardTitle>Files</CardTitle>
                <CardDescription>Click to view, then edit and save — saved edits are versioned and LDD divergence is tracked honestly.</CardDescription></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {files.map((f) => (
                  <button key={f.path} className="block w-full text-left font-mono text-xs hover:text-accent" onClick={() => openForEdit(f.path)}>
                    {f.path} <span className="text-muted-foreground">({(f.size / 1024).toFixed(1)} KB)</span>
                  </button>
                ))}
                {openFile && (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold truncate">{openFile.path}</span>
                      {!editing && <Button size="sm" variant="outline" onClick={() => { setEditContent(openFile.content); setEditing(true); setEditStale(false); }}>Edit</Button>}
                    </div>
                    {editing ? (
                      <div className="flex rounded-md border bg-muted overflow-hidden">
                        <pre className="text-xs text-muted-foreground px-2 py-2 text-right select-none overflow-hidden" aria-hidden>
                          {Array.from({ length: editContent.split('\n').length }, (_, i) => i + 1).join('\n')}
                        </pre>
                        <textarea
                          className="flex-1 min-w-0 bg-transparent font-mono text-xs p-2 outline-none resize-y"
                          rows={Math.min(18, Math.max(6, editContent.split('\n').length))}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          spellCheck={false}
                        />
                      </div>
                    ) : (
                      <pre className="max-h-56 overflow-auto rounded-md border p-2 text-xs bg-muted">{openFile.content.slice(0, 4000)}</pre>
                    )}
                    {editing && (
                      <div className="flex gap-2 items-center">
                        <Button size="sm" onClick={saveFile} disabled={editBusy || editContent === openFile.content}>{editBusy ? 'Saving…' : 'Save'}</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(false); setEditContent(openFile.content); setEditStale(false); }}>Discard</Button>
                      </div>
                    )}
                    {editStale && <p className="text-xs text-amber-600 dark:text-amber-400">Document marked stale — re-render from the LDD to reconcile canonical state.</p>}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>GitHub</CardTitle>
                <CardDescription>Connect a repo to diff, pull, and sync checkpoints. The PAT is encrypted with the AI vault and only ever returned masked.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {gh ? (
                  <div className="space-y-2">
                    <p className="font-mono text-xs">{gh.repo}@{gh.branch}</p>
                    <p className="text-xs text-muted-foreground">token: {gh.maskedPat} · saved {gh.updatedAt}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={!!ghBusy} onClick={() => ghDo('diff')}>{ghBusy === 'diff' ? 'Diffing…' : 'Diff'}</Button>
                      <Button size="sm" variant="outline" disabled={!!ghBusy} onClick={() => ghDo('pull')}>{ghBusy === 'pull' ? 'Pulling…' : 'Pull'}</Button>
                      <Button size="sm" variant="outline" disabled={!!ghBusy} onClick={() => ghDo('sync')}>{ghBusy === 'sync' ? 'Syncing…' : 'Sync checkpoint'}</Button>
                      <Button size="sm" variant="destructive" disabled={!!ghBusy} onClick={ghForget}>Forget</Button>
                    </div>
                    {ghDiff && (
                      <div className="text-xs space-y-1 rounded-md border p-2">
                        <div className="font-semibold">vs {ghDiff.repo}@{ghDiff.branch}</div>
                        <div className="text-green-600 dark:text-green-400">added: {ghDiff.added.length ? ghDiff.added.join(', ') : '—'}</div>
                        <div className="text-amber-600 dark:text-amber-400">changed: {ghDiff.changed.length ? ghDiff.changed.join(', ') : '—'}</div>
                        <div className="text-destructive">removed: {ghDiff.removed.length ? ghDiff.removed.join(', ') : '—'}</div>
                        <div className="text-muted-foreground">identical: {ghDiff.identical}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="owner/repo" value={ghRepo} onChange={(e) => setGhRepo(e.target.value)} />
                    <Input placeholder="branch (default main)" value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} />
                    <Input type="password" placeholder="GitHub PAT (fine-grained, contents:write)" value={ghPat} onChange={(e) => setGhPat(e.target.value)} />
                    <Button size="sm" disabled={!!ghBusy || !ghRepo.trim() || ghPat.length < 8} onClick={ghConnect}>{ghBusy === 'connect' ? 'Saving…' : 'Save connection'}</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Design reference</CardTitle>
                <CardDescription>Scan a public site's real CSS signals (colors, fonts, radii) and apply them as LDD design tokens — provenance is recorded in the document. No screenshots, no guessing.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <Input placeholder="https://example.com" value={scanUrl} onChange={(e) => setScanUrl(e.target.value)} />
                  <Button size="sm" variant="outline" disabled={scanBusy || !scanUrl.trim()} onClick={runScan}>{scanBusy && scanProposal === null ? 'Scanning…' : 'Scan'}</Button>
                </div>
                {scanProposal && (
                  <div className="space-y-2 rounded-md border p-2 text-xs">
                    <div className="font-semibold truncate">{scanProposal.url}</div>
                    <div className="flex gap-2 items-center flex-wrap">
                      {Object.entries(scanProposal.proposedTokens.palette).map(([k, v]: any) => (
                        <span key={k} className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border" style={{ background: v }} />{k}</span>
                      ))}
                    </div>
                    <div>body: <span className="font-mono">{scanProposal.proposedTokens.fonts.body}</span></div>
                    <div>display: <span className="font-mono">{scanProposal.proposedTokens.fonts.display}</span> · radius: <span className="font-mono">{scanProposal.proposedTokens.radius}</span></div>
                    <div className="text-muted-foreground">{scanProposal.stats.colorsFound} colors · {scanProposal.stats.stylesheetsFetched} stylesheet(s) · {scanProposal.stats.cssBytes} CSS bytes</div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={applyScan} disabled={scanBusy}>{scanBusy ? 'Applying…' : 'Apply to project'}</Button>
                      <Button size="sm" variant="outline" onClick={() => setScanProposal(null)}>Dismiss</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Site backend</CardTitle>
                <CardDescription>Give the generated site's forms a real home: submissions validate against a schema derived from the site's own forms and land in App Studio records.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {backend ? (
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge>live</Badge>
                      <span className="text-xs text-muted-foreground">{backend.recordCount} submission(s)</span>
                      <Button size="sm" variant="outline" onClick={enableBackend}>Refresh schema</Button>
                      <a className="text-xs text-accent underline" href="/studio">Open in App Studio</a>
                    </div>
                    <div className="text-xs font-mono break-all">{backend.endpoint}</div>
                    <div className="text-xs text-muted-foreground">{backend.fields.map((f) => `${f.key}${f.required ? '*' : ''}`).join(', ')}</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">Build the project first, then enable — the schema is captured from the forms in index.html.</p>
                    <Button size="sm" onClick={enableBackend}>Enable form backend</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Team metrics</CardTitle>
                <CardDescription>Measured per-role latency and evidence outcomes across your org's runs — optimization decisions from data, not vibes.</CardDescription></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {!metrics || metrics.roles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Run a build to start collecting metrics.</p>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">{metrics.totals.steps} agent step(s) · {metrics.totals.total_ms} ms total</div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {metrics.roles.map((r) => (
                        <div key={r.role} className="flex items-center gap-2 text-xs">
                          <span className="font-mono w-40 truncate">{r.role}</span>
                          <span className="text-muted-foreground">×{r.runs}</span>
                          <span>avg {r.avg_ms} ms</span>
                          <span className="text-muted-foreground">max {r.max_ms} ms</span>
                          {r.errors > 0 && <Badge variant="destructive">{r.errors} err</Badge>}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {Object.entries(metrics.evidence).map(([cat, v]: any) => (
                        <Badge key={cat} variant={v.fail ? 'destructive' : 'secondary'}>{cat}: {v.pass}p{v.fail ? `/${v.fail}f` : ''}</Badge>
                      ))}
                    </div>
                  </>
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
