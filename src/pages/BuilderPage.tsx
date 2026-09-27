import { useEffect, useState } from 'react';
import { api, type Project, type Plan } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CreationModePicker, {
  CREATION_MODES, buildCreationPayload, defaultCreationOptions,
  type CreationMode, type CreationOptions,
} from '@/components/CreationModePicker';
import { CheckCircle2, XCircle, Hammer, ShieldCheck, Save, RotateCcw, Globe, ScrollText, Clapperboard, FileDown } from 'lucide-react';

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
  factors: { name?: string; check: string; points: number; max: number; detail: string; pass: boolean }[];
  styleAudit?: StyleAudit;
  cinematicAudit?: CinematicAudit;
  siteAudits?: SiteAudits;
};
// Phase 9 — four site audit suites riding inside the QA artifact.
type AuditSuite = {
  suite: string; score: number; pass: boolean; passAt: number;
  checks: { check: string; points: number; max: number; detail: string; pass: boolean }[];
};
type SiteAudits = {
  accessibility: AuditSuite; factual: AuditSuite; visual: AuditSuite; performance: AuditSuite;
  overall: number; pass: boolean; summary: string;
};
type Plan2 = Plan & {
  style?: { id: string; name: string; source: string };
  recommendedStyles?: string[];
  creationMode?: string;
  recipe?: { version: number; styleId: string; creationMode: string; locked: boolean };
};
// Phase 7 — recipe v6 (§13): component@version per section, stored in site_recipes.
type RecipeSection = { slot: string; component: string; componentVersion?: string; variant?: string };
type RecipeV6 = {
  engine?: string; version?: number; creationMode?: string; activeStyleId?: string; styleId?: string;
  universe?: string; motionIntensity?: string; motionProfile?: string; shaderId?: string | null;
  scenes?: unknown[]; seed?: number; sections?: RecipeSection[]; locks?: Record<string, boolean>;
};
type RecipeResponse = RecipeV6 & { recipe_json?: string };
// Phase 7 — style audit (§61) + cinematic audit (§62) ride along in the QA artifact.
type StyleAudit = {
  dimensions?: Record<string, number> | { key?: string; name?: string; score?: number; points?: number }[];
  overall?: number; pass?: boolean;
};
type CinematicAudit = {
  score?: number; grade?: string;
  factors?: { check?: string; name?: string; points?: number; max?: number; detail?: string; pass?: boolean }[];
};
type LibraryItem = {
  component_id?: string; id?: string;
  component_name?: string; name?: string;
  component_family?: string; family?: string;
  component_version?: string; performance_class?: string;
  supported_styles?: string[]; variants?: { id: string; label: string }[];
};

function unwrapRecipe(d: { recipe?: RecipeResponse } | null | undefined): RecipeV6 | null {
  const r = d?.recipe;
  if (!r) return null;
  if (typeof r.recipe_json === 'string' && r.recipe_json) {
    try { return JSON.parse(r.recipe_json) as RecipeV6; } catch { return null; }
  }
  return r;
}
const itemId = (i: LibraryItem) => i.component_id || i.id || '';
const itemName = (i: LibraryItem) => i.component_name || i.name || itemId(i);
const itemFamily = (i: LibraryItem | null | undefined) => (i && (i.component_family || i.family)) || '';

function normalizeDims(dimensions: StyleAudit['dimensions']): [string, number][] {
  if (!dimensions) return [];
  if (Array.isArray(dimensions)) return dimensions.map((d) => [String(d.key || d.name || ''), Number(d.score ?? d.points ?? 0)]);
  return Object.entries(dimensions).map(([k, v]) => [k, Number(v)]);
}

export default function BuilderPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [goal, setGoal] = useState('');
  const [plan, setPlan] = useState<Plan2 | null>(null);
  const [creation, setCreation] = useState<CreationOptions>(defaultCreationOptions());
  const [built, setBuilt] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [qa, setQa] = useState<QAReport | null>(null);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [checkpoints, setCheckpoints] = useState<Cp[]>([]);
  const [cpLabel, setCpLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [recipe, setRecipe] = useState<RecipeV6 | null>(null);
  const [libItems, setLibItems] = useState<LibraryItem[]>([]);
  const [changeSel, setChangeSel] = useState<Record<string, string>>({});
  const [convertMode, setConvertMode] = useState<CreationMode>('CUSTOM_AI');

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
    setBuilt(false); setPlan(null); setValidation(null); setQa(null); setNotice('');
    api<{ artifacts: Artifact[] }>(`/builder/project/${projectId}/artifacts`).then((d) => setArtifacts(d.artifacts)).catch(() => {});
    loadQa();
    loadCps();
    loadRecipe();
  }, [projectId]);

  const loadQa = () => api<{ report: QAReport }>(`/builder/project/${projectId}/qa`).then((d) => setQa(d.report)).catch(() => setQa(null));

  const loadCps = () => api<{ checkpoints: Cp[] }>(`/checkpoints/project/${projectId}`).then((d) => setCheckpoints(d.checkpoints)).catch(() => {});

  const loadRecipe = () =>
    api<{ recipe?: RecipeResponse }>(`/builder/project/${projectId}/recipe`)
      .then((d) => setRecipe(unwrapRecipe(d)))
      .catch(() => setRecipe(null));

  // Compatible alternatives for the Change-Component control come from the
  // component library filtered by the section's current component family (§37).
  useEffect(() => {
    if (!recipe) return;
    api<{ items?: LibraryItem[] }>('/library/components?pageSize=100')
      .then((d) => setLibItems(d.items || []))
      .catch(() => setLibItems([]));
  }, [recipe]);

  const alternativesFor = (section: RecipeSection): LibraryItem[] => {
    const current = libItems.find((i) => itemId(i) === section.component) || null;
    const family = itemFamily(current);
    const pool = family ? libItems.filter((i) => itemFamily(i) === family) : [];
    return pool.length ? pool : libItems;
  };

  const run = async (step: 'plan' | 'build') => {
    setError(''); setNotice(''); setBusy(step);
    const opts = { goal, ...buildCreationPayload(creation) };
    try {
      if (step === 'plan') {
        const d = await api<{ plan: Plan2 }>(`/builder/project/${projectId}/plan`, { method: 'POST', body: JSON.stringify(opts) });
        setPlan(d.plan);
        if (!creation.styleId && d.plan.style) setCreation((c) => ({ ...c, styleId: d.plan.style!.id }));
      } else {
        await api(`/builder/project/${projectId}/build`, { method: 'POST', body: JSON.stringify(opts) });
        setBuilt(true);
        const d = await api<{ artifacts: Artifact[] }>(`/builder/project/${projectId}/artifacts`);
        setArtifacts(d.artifacts);
        loadQa();
        loadRecipe();
      }
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  // §37 — swap one recipe section to a compatible component; the server rebuilds
  // from the SAME plan seed/content (content, STYLE_LOCK and universe preserved).
  const changeComponent = async (slot: string) => {
    const componentId = changeSel[slot];
    if (!projectId || !componentId) return;
    setError(''); setNotice(''); setBusy(`change:${slot}`);
    try {
      const d = await api<{ recipe?: RecipeResponse; qa?: QAReport }>(`/builder/project/${projectId}/change-component`, {
        method: 'POST', body: JSON.stringify({ section: slot, componentId }),
      });
      const r = unwrapRecipe(d);
      if (r) setRecipe(r);
      if (d.qa) setQa(d.qa);
      setBuilt(true);
      setNotice(`Section “${slot.replaceAll('_', ' ')}” rebuilt with ${componentId} — only that section changed.`);
      const a = await api<{ artifacts: Artifact[] }>(`/builder/project/${projectId}/artifacts`).catch(() => null);
      if (a) setArtifacts(a.artifacts);
    } catch (e: any) { setError(e.message); } finally { setBusy(''); }
  };

  // §38 — recompose the plan for another creation mode; does NOT rebuild or publish.
  const convert = async () => {
    if (!projectId) return;
    setError(''); setNotice(''); setBusy('convert');
    try {
      const d = await api<{ plan: Plan2 }>(`/builder/project/${projectId}/convert`, {
        method: 'POST', body: JSON.stringify({ creationMode: convertMode }),
      });
      setPlan(d.plan);
      setCreation((c) => ({ ...c, creationMode: convertMode }));
      setNotice(`Plan recomposed for ${CREATION_MODES.find((m) => m.id === convertMode)?.label}. Press “Build & preview” to apply — same seed, content pack and style lock.`);
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
          <CreationModePicker
            value={creation}
            onChange={setCreation}
            recommended={plan?.recommendedStyles || []}
            busy={busy === 'plan'}
            disabled={!projectId || !goal || !!busy}
            generateLabel="1 · Generate plan"
            onGenerate={() => run('plan')}
          />
          <div className="flex gap-2">
            <Button onClick={() => run('build')} disabled={!projectId || !goal || !!busy}>
              {busy === 'build' ? 'Building…' : '2 · Build & preview'}
            </Button>
            <Button variant="secondary" onClick={validate} disabled={!projectId || !!busy}>
              <ShieldCheck className="h-4 w-4 mr-1" /> {busy === 'validate' ? 'Validating…' : 'Run QA validation'}
            </Button>
            <Button variant="outline" onClick={publish} disabled={!projectId || !built || !!busy}>
              <Globe className="h-4 w-4 mr-1" /> {busy === 'publish' ? 'Publishing…' : 'Publish live link'}
            </Button>
            <Button variant="outline" disabled={!projectId || !built || !!busy} title="Download a print-perfect single-file view — open it and use the browser's Save as PDF to produce the PDF">
              <a href={`/api/builder/project/${projectId}/pdf`} target="_blank" rel="noreferrer" className="flex items-center">
                <FileDown className="h-4 w-4 mr-1" /> Export PDF
              </a>
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
          {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}
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

      {recipe && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Site recipe — v{recipe.version ?? '?'}{recipe.engine ? ` · ${recipe.engine}` : ''}</CardTitle>
            <CardDescription>
              Component@version per section (§13 Phase 7). Swap a section with a compatible alternative, or convert the whole plan to another creation mode.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
              <Badge variant="secondary">{recipe.creationMode?.replaceAll('_', ' ') || '—'}</Badge>
              {recipe.styleId && <Badge variant="outline">style {recipe.styleId}</Badge>}
              {recipe.motionProfile && <Badge variant="outline">{recipe.motionProfile}</Badge>}
              {recipe.shaderId && <Badge variant="outline">shader {recipe.shaderId}</Badge>}
              {typeof recipe.seed === 'number' && <span>seed {recipe.seed}</span>}
              {recipe.locks?.style && <span>STYLE_LOCK</span>}
            </div>
            <ul className="space-y-2">
              {(recipe.sections || []).map((s) => {
                const alternatives = alternativesFor(s);
                const selected = changeSel[s.slot] || s.component;
                return (
                  <li key={s.slot} className="border rounded-lg p-2.5 space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium capitalize">{s.slot.replaceAll('_', ' ')}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate">
                          {s.component}{s.componentVersion ? `@${s.componentVersion}` : ''}{s.variant ? ` · variant ${s.variant}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Select value={selected} onValueChange={(v) => setChangeSel((cs) => ({ ...cs, [s.slot]: v }))}>
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {alternatives.map((i) => (
                            <SelectItem key={itemId(i) || s.component} value={itemId(i) || s.component}>
                              {itemName(i)} <span className="text-xs text-muted-foreground">({itemId(i)})</span>
                            </SelectItem>
                          ))}
                          {!alternatives.length && <SelectItem value={s.component}>{s.component}</SelectItem>}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!projectId || !!busy || selected === s.component || !alternatives.length}
                        onClick={() => changeComponent(s.slot)}
                      >
                        {busy === `change:${s.slot}` ? 'Applying…' : 'Change'}
                      </Button>
                    </div>
                  </li>
                );
              })}
              {!recipe.sections?.length && <li className="text-sm text-muted-foreground">No sections recorded in this recipe.</li>}
            </ul>
            <div className="flex flex-wrap gap-2 items-end border-t pt-3">
              <div>
                <label className="text-xs text-muted-foreground">Convert mode (§38)</label>
                <Select value={convertMode} onValueChange={(v) => setConvertMode(v as CreationMode)}>
                  <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CREATION_MODES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={convert} disabled={!projectId || !!busy}>
                <RotateCcw className="h-4 w-4 mr-1" /> {busy === 'convert' ? 'Converting…' : 'Convert plan'}
              </Button>
              <span className="text-xs text-muted-foreground pb-2">Recomposes the plan only — never rebuilds or publishes.</span>
            </div>
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
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
                      <Button key={d} size="sm" variant={device === d ? 'default' : 'outline'} className="h-7"
                        onClick={() => setDevice(d)}>
                        {d === 'desktop' ? 'Desktop 1280' : d === 'tablet' ? 'Tablet 768' : 'Mobile 390'}
                      </Button>
                    ))}
                    <a className="text-xs text-primary hover:underline ml-auto"
                      href={`/api/builder/project/${projectId}/device?device=${device}`} target="_blank" rel="noreferrer">
                      Open full device lab ↗
                    </a>
                  </div>
                  <div className="flex justify-center overflow-auto rounded-lg border bg-muted/30 p-2">
                    <iframe title="site-preview" src={`/api/builder/project/${projectId}/preview`}
                      className="rounded bg-white border transition-all"
                      style={{
                        width: device === 'mobile' ? 390 : device === 'tablet' ? 768 : '100%',
                        maxWidth: '100%',
                        height: 480,
                      }} />
                  </div>
                </div>
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

          {qa?.siteAudits && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">
                {qa.siteAudits.pass ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-amber-500" />}
                Site audits — {qa.siteAudits.overall}/10 {qa.siteAudits.pass ? '· all suites pass' : '· suite below bar'}
              </CardTitle>
              <CardDescription>Phase 9 — accessibility, factual, visual and performance, run on every build against the same artifact. Accessibility passes at ≥7, the rest at ≥6.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {(['accessibility', 'factual', 'visual', 'performance'] as const).map((key) => {
                  const s = qa.siteAudits![key];
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        {s.pass ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-amber-500 shrink-0" />}
                        <span className="font-medium capitalize">{s.suite}</span>
                        <span className="text-muted-foreground">{s.score}/10 (bar {s.passAt})</span>
                      </div>
                      <ul className="space-y-1 text-sm pl-6">
                        {s.checks.filter((c) => !c.pass).map((c) => (
                          <li key={c.check} className="text-muted-foreground">
                            <span className="font-medium text-foreground">{c.check}</span> — {c.points}/{c.max} · {c.detail}
                          </li>
                        ))}
                        {s.checks.every((c) => c.pass) && <li className="text-muted-foreground">All checks pass.</li>}
                      </ul>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {qa?.styleAudit && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Style audit — {typeof qa.styleAudit.overall === 'number' ? qa.styleAudit.overall.toFixed(1) : '—'}/10 {qa.styleAudit.pass ? '· PASS' : '· below bar'}
              </CardTitle>
              <CardDescription>Ten design dimensions, each scored 0–10 (§61). The bar for a genuine render is ≥9 overall.</CardDescription></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {normalizeDims(qa.styleAudit.dimensions).map(([name, score]) => (
                    <li key={name} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-muted-foreground capitalize">{name.replace(/([A-Z])/g, ' $1')}</span>
                      <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(10, score)) * 10}%` }} />
                      </div>
                      <span className="w-10 text-right font-medium">{score}</span>
                    </li>
                  ))}
                  {!normalizeDims(qa.styleAudit.dimensions).length && <li className="text-muted-foreground">No dimension scores recorded.</li>}
                </ul>
              </CardContent>
            </Card>
          )}

          {qa?.cinematicAudit && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2">
                <Clapperboard className="h-5 w-5 text-primary" />
                Cinematic audit — {qa.cinematicAudit.grade || '—'} · {typeof qa.cinematicAudit.score === 'number' ? qa.cinematicAudit.score : '—'}/100
              </CardTitle>
              <CardDescription>Motion purpose, scroll smoothness, readability, pacing, mobile, reduced-motion, performance, conversion (§62).</CardDescription></CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {(qa.cinematicAudit.factors || []).map((f, idx) => (
                    <li key={f.check || f.name || idx} className="flex items-start gap-2">
                      {f.pass ? <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
                      <div>
                        <span className="font-medium">{f.check || f.name}</span>
                        <span className="text-muted-foreground"> — {f.points ?? '?'}/{f.max ?? '?'} · {f.detail}</span>
                      </div>
                    </li>
                  ))}
                  {!qa.cinematicAudit.factors?.length && <li className="text-muted-foreground">No factors recorded.</li>}
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
