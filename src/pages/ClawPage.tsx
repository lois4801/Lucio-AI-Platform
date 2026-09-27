import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type ClawStatus = { configured: boolean; mode: string; binary: string | null; cargo: boolean; steps: string[] };
type Job = { id: string; project_id: string; prompt: string; status: string; error: string; exit_code: number | null; created_at: string };
type OutFile = { path: string; size: number; action: 'create' | 'update' | 'unchanged'; content: string };
type ApplyResult = { applied: { path: string; action: string }[]; checkpoint: { id: string; label: string; manifestHash: string }; evidence: { category: string; check: string; mandatory: boolean; pass: boolean; detail: string }[] };

export default function ClawPage() {
  const [status, setStatus] = useState<ClawStatus | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [key, setKey] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);
  // Apply-to-project state
  const [outFiles, setOutFiles] = useState<OutFile[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  const loadOutput = async (jobId: string) => {
    setApplyResult(null); setPreview(null);
    try {
      const r = await api<{ files: OutFile[] }>(`/claw/jobs/${jobId}/output`);
      setOutFiles(r.files || []);
      setPicked(new Set((r.files || []).filter((f) => f.action !== 'unchanged').map((f) => f.path)));
    } catch { setOutFiles([]); setPicked(new Set()); }
  };
  useEffect(() => {
    if (activeJob?.status === 'completed') loadOutput(activeJob.id);
    else { setOutFiles([]); setPicked(new Set()); setApplyResult(null); }
  }, [activeJob?.id, activeJob?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePick = (p: string) => setPicked((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const apply = async () => {
    if (!activeJob || applying) return;
    setApplying(true); setMsg('');
    try {
      const r = await api<ApplyResult>(`/claw/jobs/${activeJob.id}/apply`, { method: 'POST', body: JSON.stringify({ files: [...picked] }) });
      setApplyResult(r);
    } catch (e: any) { setMsg(e.message); }
    finally { setApplying(false); }
  };

  const loadStatus = () => api('/claw/status').then((r) => setStatus(r.claw)).catch((e) => setMsg(e.message));
  const loadJobs = () => api('/claw/jobs').then((r) => setJobs(r.jobs)).catch(() => {});
  useEffect(() => { loadStatus(); loadJobs(); api('/nexus/projects').then((r) => setProjects(r.projects)).catch(() => {}); }, []);

  const watch = (jobId: string) => {
    esRef.current?.close();
    setLines([]);
    const es = new EventSource(`/api/claw/jobs/${jobId}/events`);
    esRef.current = es;
    es.addEventListener('line', (ev) => {
      const { line } = JSON.parse((ev as MessageEvent).data);
      setLines((l) => [...l, line]);
    });
    es.addEventListener('status', (ev) => {
      const s = JSON.parse((ev as MessageEvent).data);
      if (s.status === 'completed' || s.status === 'failed') { loadJobs(); es.close(); }
    });
  };

  const start = async () => {
    if (!projectId || !prompt.trim()) return;
    setMsg('');
    try {
      const r = await api('/claw/jobs', { method: 'POST', body: JSON.stringify({ projectId, prompt: prompt.trim(), key: key.trim() || undefined }) });
      setActiveJob(r.job);
      setPrompt('');
      loadJobs();
      watch(r.job.id);
    } catch (e: any) {
      setMsg(e.message);
      loadStatus();
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Claw Coder</h1>
        <p className="text-muted-foreground">Claw Code (MIT) wired in as your AI coder — it works on a real workspace scaffolded from your NEXUS project and streams every step live.</p>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Runtime status</CardTitle>
            {status && <Badge variant={status.configured ? 'default' : 'secondary'}>{status.configured ? `ready · ${status.mode}` : 'not configured'}</Badge>}
          </div>
          <CardDescription>
            {status?.configured
              ? status.mode === 'binary' ? `Using ${status.binary}` : `Runner override: ${status.mode === 'runner-override' ? 'custom command' : status.mode}`
              : 'The vendored harness needs a one-time setup on this host:'}
          </CardDescription>
        </CardHeader>
        {status && !status.configured && (
          <CardContent>
            <ol className="list-decimal list-inside text-sm space-y-1">
              {status.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            <p className="text-xs text-muted-foreground mt-2">cargo on PATH: {status.cargo ? 'yes' : 'no'} · vendored workspace: <code>vendor/claw-code/rust</code></p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">New coding job</CardTitle>
          <CardDescription>Pick a NEXUS project — Claw gets a real workspace (CONTEXT.md with your files, brief, and latest build intent) and codes against it.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Input type="password" placeholder="Provider key (optional BYOK — never stored)" value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <textarea
            className="w-full min-h-[90px] rounded-md border bg-background p-2 text-sm"
            placeholder="Describe what to build or change, e.g. 'Add a booking section to index.html with a form and client-side validation'"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Button onClick={start} disabled={!projectId || !prompt.trim()}>Run Claw Coder</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Jobs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {jobs.length === 0 && <p className="text-xs text-muted-foreground">No jobs yet.</p>}
            {jobs.map((j) => (
              <button key={j.id} className={`w-full text-left rounded-md border p-2 text-sm hover:border-primary ${activeJob?.id === j.id ? 'border-primary' : ''}`} onClick={() => { setActiveJob(j); watch(j.id); }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{j.prompt}</span>
                  <Badge variant={j.status === 'completed' ? 'default' : j.status === 'failed' ? 'destructive' : 'secondary'}>{j.status}</Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">{j.created_at}</span>
                {j.error && <p className="text-[10px] text-destructive mt-1 line-clamp-2">{j.error}</p>}
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Live output</CardTitle>
            <CardDescription>NDJSON event stream from the agent — diagnostics (stderr) are captured separately on failure.</CardDescription></CardHeader>
          <CardContent>
            <pre className="h-[380px] overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
              {lines.length === 0 ? 'Start a job or select one to replay its stream.' : lines.join('\n')}
            </pre>
          </CardContent>
        </Card>
      </div>

      {activeJob?.status === 'completed' && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Apply to project</CardTitle>
            <CardDescription>
              Files Claw wrote in its workspace, diffed against your NEXUS project tree. Pick what to merge — everything applies as one immutable checkpoint you can roll back.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {outFiles.length === 0 && <p className="text-xs text-muted-foreground">No output files in this job's workspace.</p>}
            {outFiles.map((f) => (
              <div key={f.path} className="rounded-md border text-sm">
                <div className="flex items-center gap-2 px-3 py-2">
                  <input type="checkbox" checked={picked.has(f.path)} onChange={() => togglePick(f.path)} disabled={f.action === 'unchanged'} />
                  <span className="font-mono text-xs flex-1">{f.path}</span>
                  <span className="text-[10px] text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                  <Badge variant={f.action === 'create' ? 'default' : f.action === 'update' ? 'secondary' : 'outline'}>{f.action}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => setPreview(preview === f.path ? null : f.path)}>{preview === f.path ? 'Hide' : 'Preview'}</Button>
                </div>
                {preview === f.path && (
                  <pre className="max-h-64 overflow-auto border-t bg-muted/40 p-3 text-[11px] whitespace-pre-wrap">{f.content.slice(0, 4000)}</pre>
                )}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Button onClick={apply} disabled={applying || picked.size === 0}>
                {applying ? 'Applying…' : `Apply ${picked.size} file(s) as checkpoint`}
              </Button>
              {applyResult && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  Checkpoint <code>{applyResult.checkpoint.id.slice(0, 8)}</code> created — {applyResult.applied.length} file(s) merged.
                  Evidence: {applyResult.evidence.filter((e) => e.pass).length}/{applyResult.evidence.length} checks pass
                  {applyResult.evidence.some((e) => e.mandatory && !e.pass) ? ' — mandatory failures, review before deploying' : ''}.
                </span>
              )}
            </div>
            {applyResult && (
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                {applyResult.evidence.map((e, i) => (
                  <span key={i} className={e.pass ? '' : 'text-destructive'}>{e.pass ? '✓' : '✗'} {e.check}</span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
