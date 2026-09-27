import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, CheckCircle2, CircleDashed, XCircle, Play, ExternalLink } from 'lucide-react';

type Step = { id: string; label: string; agents: string[]; status: string; cost: number; output: any; durationMs: number };
type Run = {
  id: string; goal: string; project_id: string; status: string;
  budget_cap: number; budget_used: number; failure_reason: string | null;
  created_at: string; finished_at: string | null;
  plan?: { steps: { id: string; label: string; why: string; agents: string[] }[] };
  steps?: Step[]; handoff?: any;
};
type RunSummary = { id: string; goal: string; project_id: string; status: string; budget_cap: number; budget_used: number; failure_reason: string | null; created_at: string; finished_at: string | null };

export default function AgentRunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [running, setRunning] = useState(false);

  const load = () => api<{ runs: RunSummary[] }>('/agent-runs').then((d) => setRuns(d.runs)).catch(() => {});
  useEffect(() => { load(); }, []);

  const openRun = async (id: string) => {
    setError('');
    try {
      const d = await api<{ run: Run }>(`/agent-runs/${id}`);
      setSelected(d.run);
    } catch (e: any) { setError(e.message); }
  };

  const start = async () => {
    setError(''); setNotice(''); setRunning(true);
    try {
      const d = await api<{ run: Run }>('/agent-runs', { method: 'POST', body: JSON.stringify({ goal }) });
      setNotice(`Run ${d.run.status} — budget ${d.run.budget_used}/${d.run.budget_cap}`);
      setGoal('');
      await load();
      setSelected(d.run);
    } catch (e: any) { setError(e.message); }
    finally { setRunning(false); }
  };

  const stepIcon = (s: Step) =>
    s.status === 'ok' ? <CheckCircle2 className="h-4 w-4 text-green-500" />
    : s.status === 'failed' ? <XCircle className="h-4 w-4 text-destructive" />
    : <CircleDashed className="h-4 w-4 text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Runs</h1>
        <p className="text-muted-foreground">One goal drives the whole pipeline: research → plan → bounded agent selection → build → test → preview → demo publish → handoff. The router only walks a fixed step registry; production publishing stays behind the approval gate.</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

      <Card>
        <CardHeader><CardTitle>Start a run</CardTitle>
          <CardDescription>Describe the website in one sentence. Budget cap: 100 credits per run (AGENT_RUN_BUDGET).</CardDescription></CardHeader>
        <CardContent className="flex gap-2">
          <Input placeholder="e.g. A premium dental clinic website in Vancouver with booking and a gallery" value={goal} onChange={(e) => setGoal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && goal.trim() && !running) start(); }} />
          <Button onClick={start} disabled={!goal.trim() || running}><Play className="h-4 w-4 mr-1" /> {running ? 'Running…' : 'Run'}</Button>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card>
          <CardHeader><CardTitle>Runs</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {runs.map((r) => (
              <button key={r.id} onClick={() => openRun(r.id)} className={`w-full text-left rounded-md border px-3 py-2 space-y-1 hover:bg-muted/50 ${selected?.id === r.id ? 'border-primary' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium line-clamp-1">{r.goal}</span>
                  <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · budget {r.budget_used}/{r.budget_cap}{r.failure_reason ? ` · ${r.failure_reason}` : ''}</div>
              </button>
            ))}
            {!runs.length && <p className="text-sm text-muted-foreground">No runs yet — start one above.</p>}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Run trace</CardTitle>
              <CardDescription>{selected.goal}</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <Badge variant={selected.status === 'completed' ? 'default' : selected.status === 'failed' ? 'destructive' : 'secondary'}>{selected.status}</Badge>
                <span className="text-xs text-muted-foreground">budget {selected.budget_used}/{selected.budget_cap}</span>
                {selected.failure_reason && <span className="text-xs text-destructive">{selected.failure_reason}</span>}
              </div>
              <ul className="space-y-2">
                {(selected.steps || []).map((s) => {
                  const why = selected.plan?.steps?.find((p) => p.id === s.id)?.why;
                  return (
                    <li key={s.id} className="rounded-md border px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium">{stepIcon(s)} {s.label}</span>
                        <span className="text-xs text-muted-foreground">{s.cost}cr · {s.durationMs}ms{s.agents?.length ? ` · ${s.agents.join(', ')}` : ''}</span>
                      </div>
                      {s.id === 'build' && s.output && typeof s.output === 'object' && (
                        <div className="mt-1">
                          {s.output.source === 'ai'
                            ? <Badge className="bg-emerald-600 hover:bg-emerald-600">AI-authored by {s.output.provider || 'your AI provider'}</Badge>
                            : <Badge variant="secondary">Template build{s.output.reason ? ` — ${s.output.reason}` : ''} · add AI keys in AI Providers for AI-authored luxury sites</Badge>}
                        </div>
                      )}
                      {why && <p className="text-xs text-muted-foreground mt-1">{why}</p>}
                      {s.output && <pre className="text-xs bg-muted rounded p-2 mt-1 overflow-x-auto max-h-28">{JSON.stringify(s.output, null, 1)}</pre>}
                    </li>
                  );
                })}
              </ul>
              {selected.handoff && (
                <div className="rounded-md border border-primary/40 p-3 space-y-2">
                  <h3 className="text-sm font-semibold">Handoff</h3>
                  <div className="flex flex-wrap gap-2">
                    {selected.handoff.liveUrl && <Button size="sm" variant="outline" onClick={() => window.open(selected.handoff.liveUrl, '_blank')}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Live demo</Button>}
                    {selected.handoff.previewUrl && <Button size="sm" variant="outline" onClick={() => window.open(selected.handoff.previewUrl, '_blank')}>Preview</Button>}
                  </div>
                  {selected.handoff.qa && <p className="text-xs text-muted-foreground">QA overall {selected.handoff.qa.overall}/10 · pass {String(selected.handoff.qa.pass)}</p>}
                  <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                    {(selected.handoff.nextActions || []).map((a: string) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
