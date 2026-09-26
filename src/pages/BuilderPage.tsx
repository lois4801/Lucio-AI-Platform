import { useEffect, useState } from 'react';
import { api, type Project, type Plan } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, Hammer, ShieldCheck, Save, RotateCcw, Globe } from 'lucide-react';

const SAMPLE_GOALS = [
  'Build a warm cozy website for a cafe called Bluebird Coffee in Toronto with a menu, gallery and online booking',
  'Create a bold premium site for a fitness gym called Iron Works with class booking and testimonials',
  'Make a modern website for a plumbing company called RapidFlow in Austin with booking, reviews and a quote form',
];

type Artifact = { id: string; kind: string; path: string; version: number; created_at: string };
type Validation = { passed: boolean; checks: { name: string; passed: boolean }[] };
type Cp = { id: string; label: string; created_at: string };
type QAReport = {
  score: number; grade: string; summary: string;
  factors: { check: string; points: number; max: number; detail: string; pass: boolean }[];
};
type Plan2 = Plan & {
  style?: { id: string; name: string; source: string };
  recommendedStyles?: string[];
  creationMode?: string;
  recipe?: { version: number; styleId: string; creationMode: string; locked: boolean };
};
const MODES = [
  { id: 'CUSTOM_AI', label: 'AI Custom Design' },
  { id: 'COMPONENT_SYSTEM', label: 'Component System' },
  { id: 'HYBRID', label: 'Hybrid' },
  { id: 'CINEMATIC_UNIVERSE', label: 'Cinematic Universe' },
];

export default function BuilderPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [goal, setGoal] = useState('');
  const [plan, setPlan] = useState<Plan2 | null>(null);
  const [styleId, setStyleId] = useState('');
  const [creationMode, setCreationMode] = useState('CUSTOM_AI');
  const [built, setBuilt] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [qa, setQa] = useState<QAReport | null>(null);
  const [checkpoints, setCheckpoints] = useState<Cp[]>([]);
  const [cpLabel, setCpLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { projects } = await api<{ projects: Project[] }>('/projects');
    setProjects(projects);
    // deep-link support: /builder?project=<id> (from Projects page cards)
    const urlProject = new URLSearchParams(window.location.search).get('project');
    if (urlProject && projects.some((p) => p.id === urlProject)) setProjectId(urlProject);
    else if (!projectId && projects.length) setProjectId(projects[0].id);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  useEffect(() => {
    if (!projectId) return;
    setBuilt(false); setPlan(null); setValidation(null); setQa(null);
    api<{ artifacts: Artifact[] }>(`/builder/project/${projectId}/artifacts`).then((d) => setArtifacts(d.artifacts)).catch(() => {});
    loadQa();
    loadCps();
  }, [projectId]);

  const loadQa = () => api<{ report: QAReport }>(`/builder/project/${projectId}/qa`).then((d) => setQa(d.report)).catch(() => setQa(null));

  const loadCps = () => api<{ checkpoints: Cp[] }>(`/checkpoints/project/${projectId}`).then((d) => setCheckpoints(d.checkpoints)).catch(() => {});

  const run = async (step: 'plan' | 'build') => {
    setError(''); setBusy(step);
    const opts = { goal, styleId: styleId || undefined, creationMode };
    try {
      if (step === 'plan') {
        const d = await api<{ plan: Plan2 }>(`/builder/project/${projectId}/plan`, { method: 'POST', body: JSON.stringify(opts) });
        setPlan(d.plan);
        if (!styleId && d.plan.style) setStyleId(d.plan.style.id);
      } else {
        await api(`/builder/project/${projectId}/build`, { method: 'POST', body: JSON.stringify(opts) });
        setBuilt(true);
        const d = await api<{ artifacts: Artifact[] }>(`/builder/project/${projectId}/artifacts`);
        setArtifacts(d.artifacts);
        loadQa();
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  const validate = async () => {
    setError(''); setBusy('validate');
    try {
      const { job } = await api<{ job: { output: Validation } }>('/jobs', { method: 'POST', body: JSON.stringify({ type: 'validate', projectId }) });
      setValidation(job.output);
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  // Publish a live public link for the built site (Pindrop-style sell flow).
  const [publishInfo, setPublishInfo] = useState<{ slug: string; token: string } | null>(null);
  const publish = async () => {
    setError(''); setBusy('publish');
    try {
      const d = await api<{ site: { slug: string; owner_token: string } }>('/sell/publish', { method: 'POST', body: JSON.stringify({ projectId }) });
      setPublishInfo({ slug: d.site.slug, token: d.site.owner_token });
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  const createCp = async () => {
    setError('');
    try {
      await api('/checkpoints', { method: 'POST', body: JSON.stringify({ projectId, label: cpLabel || `Checkpoint ${checkpoints.length + 1}` }) });
      setCpLabel(''); loadCps();
    } catch (e: any) { setError(e.message); }
  };

  const restore = async (id: string) => {
    setError('');
    try {
      await api(`/checkpoints/${id}/restore`, { method: 'POST' });
      setBuilt(true);
      const d = await api<{ artifacts: Artifact[] }>(`/builder/project/${projectId}/artifacts`);
      setArtifacts(d.artifacts);
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lucio High-Level App Builder</h1>
        <p className="text-muted-foreground">Describe what you want — Lucio researches, plans, scaffolds, and previews it on the Sovereign Engine.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Hammer className="h-5 w-5" /> What do you want to build?</CardTitle>
          <CardDescription>Try a sample or write your own. Everything runs locally — no credits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Project</span>
            <Select value={projectId} onValueChange={(id) => { setProjectId(id); window.history.replaceState(null, '', `/builder?project=${id}`); }}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select a project" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!projects.length && <span className="text-sm text-muted-foreground">Create one on the Projects page first.</span>}
          </div>
          <Textarea rows={3} placeholder='e.g. "Build a modern website for a salon called Glow Studio in Denver with booking, a gallery and testimonials"'
            value={goal} onChange={(e) => setGoal(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {SAMPLE_GOALS.map((s) => (
              <Badge key={s} variant="secondary" className="cursor-pointer max-w-full truncate" onClick={() => setGoal(s)}>Try: {s.slice(0, 60)}…</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Creation mode</span>
            <Select value={creationMode} onValueChange={setCreationMode}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground whitespace-nowrap">LD style</span>
            <Select value={styleId || 'auto'} onValueChange={(v) => setStyleId(v === 'auto' ? '' : v)}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Auto-recommend" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-recommend</SelectItem>
                {plan?.recommendedStyles?.map((sid) => <SelectItem key={sid} value={sid}>{sid}</SelectItem>)}
                {plan?.style && !plan.recommendedStyles?.includes(plan.style.id) && <SelectItem value={plan.style.id}>{plan.style.id} {plan.style.name}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => run('plan')} disabled={!projectId || !goal || !!busy}>
              {busy === 'plan' ? 'Planning…' : '1 · Generate plan'}
            </Button>
            <Button onClick={() => run('build')} disabled={!projectId || !goal || !!busy}>
              {busy === 'build' ? 'Building…' : '2 · Build & preview'}
            </Button>
            <Button variant="secondary" onClick={validate} disabled={!projectId || !!busy}>
              <ShieldCheck className="h-4 w-4 mr-1" /> {busy === 'validate' ? 'Validating…' : 'Run QA validation'}
            </Button>
            <Button variant="outline" onClick={publish} disabled={!projectId || !built || !!busy}>
              <Globe className="h-4 w-4 mr-1" /> {busy === 'publish' ? 'Publishing…' : 'Publish live link'}
            </Button>
          </div>
          {publishInfo && (
            <div className="text-sm border rounded-lg p-3 bg-muted/40 space-y-1">
              <div>Live site: <a className="text-primary underline font-medium" href={`/live/${publishInfo.slug}`} target="_blank" rel="noreferrer">{window.location.origin}/live/{publishInfo.slug}</a></div>
              <div>Owner portal (give this to the client): <a className="text-primary underline" href={`/portal/${publishInfo.token}`} target="_blank" rel="noreferrer">{window.location.origin}/portal/{publishInfo.token}</a></div>
              <div className="text-xs text-muted-foreground">Track the deal, payment status, change requests and leads under “Clients & Sites” in the sidebar.</div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>Plan — {plan.siteName}</CardTitle>
            <CardDescription>{plan.industry}{plan.location ? ` · ${plan.location}` : ''} · tone: {plan.tone} · mode: {plan.creationMode?.replaceAll('_', ' ')} · pages: {plan.pages.join(', ')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">{plan.tagline}</p>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="default">{plan.style?.id} {plan.style?.name}</Badge>
              <span className="text-xs text-muted-foreground">STYLE_LOCK · recipe v{plan.recipe?.version} · {plan.style?.source === 'recommended' ? 'auto-selected (change above)' : 'your pick'}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {plan.services.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}
              {plan.features.map((f) => <Badge key={f}>{f}</Badge>)}
            </div>
            <div className="flex gap-1.5 items-center text-sm text-muted-foreground">
              Palette:
              {Object.values(plan.palette).map((c) => <span key={c} className="inline-block h-4 w-4 rounded border" style={{ background: c }} />)}
            </div>
            <p className="text-xs text-muted-foreground">SEO title: {plan.seo.title}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live preview</CardTitle>
              <CardDescription>Latest generated site for this project. Rebuild to update.</CardDescription>
            </CardHeader>
            <CardContent>
              {built || artifacts.length ? (
                <iframe title="site-preview" src={`/api/builder/project/${projectId}/preview`}
                  className="w-full h-[480px] rounded-lg border bg-white" />
              ) : (
                <div className="h-[480px] rounded-lg border border-dashed flex items-center justify-center text-muted-foreground text-sm">
                  No build yet — describe your idea above and press “Build &amp; preview”.
                </div>
              )}
            </CardContent>
          </Card>

          {qa && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Design QA — {qa.grade} · {qa.score}/100
              </CardTitle>
              <CardDescription>Automatic audit against this site&rsquo;s design universe tokens (runs on every build).</CardDescription></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {qa.factors.map((f) => (
                    <li key={f.check} className="flex items-start gap-2">
                      {f.pass ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                      <div>
                        <span className="font-medium">{f.check}</span>
                        <span className="text-muted-foreground"> — {f.points}/{f.max} · {f.detail}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {validation && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">
                {validation.passed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-destructive" />}
                QA validation — {validation.passed ? 'PASSED' : 'FAILED'}
              </CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm">
                  {validation.checks.map((c) => (
                    <li key={c.name} className="flex items-center gap-2">
                      {c.passed ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      {c.name}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Versions</CardTitle><CardDescription>Every build is versioned and auditable.</CardDescription></CardHeader>
            <CardContent>
              {artifacts.length === 0 && <p className="text-sm text-muted-foreground">No artifacts yet.</p>}
              <ul className="space-y-2 text-sm">
                {artifacts.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex justify-between items-center">
                    <span className="font-mono text-xs">{a.path}</span>
                    <Badge variant="outline">v{a.version}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Save className="h-5 w-5" /> Checkpoints</CardTitle>
              <CardDescription>Snapshots you can roll back to.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="Checkpoint label" value={cpLabel} onChange={(e) => setCpLabel(e.target.value)} />
                <Button variant="outline" onClick={createCp} disabled={!projectId}>Save</Button>
              </div>
              {checkpoints.map((c) => (
                <div key={c.id} className="flex justify-between items-center text-sm border rounded-lg p-2">
                  <div>
                    <div className="font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => restore(c.id)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                  </Button>
                </div>
              ))}
              {!checkpoints.length && <p className="text-sm text-muted-foreground">No checkpoints yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
