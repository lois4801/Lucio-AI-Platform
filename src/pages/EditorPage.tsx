import { useEffect, useState } from 'react';
import { api, type Project } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Eye, EyeOff, ArrowUp, ArrowDown, Lock, Check, X, RotateCcw, GitCompare,
  Pencil, Type, Image, Palette, Zap, LayoutGrid, History,
} from 'lucide-react';

// Phase 8 — Unified Website Editor (§58–§60). Every change is a proposal
// (site_edits) that must be approved; locked layers reject unless the owner
// explicitly overrides (which is audited). Scenes stay §70 AUTO — the scene lock
// is visible but there are no manual scene edits.
type Recipe = {
  version?: number; creationMode?: string; styleId?: string; activeStyleId?: string;
  motionIntensity?: string; motionProfile?: string; locks?: Record<string, boolean>;
  sectionOrder?: string[]; hiddenSlots?: string[]; contentOverrides?: { path: string; value: string }[];
  imageOverrides?: Record<string, string>;
};
type PackItem = { text: string; classification?: string };
type ContentPack = {
  headline?: PackItem; subline?: PackItem;
  about?: PackItem[]; differentiators?: PackItem[]; journey?: PackItem[];
  services?: { title: string; description: string; classification?: string }[];
  faqs?: { q: string; a: string }[];
};
type Plan = { contentPack?: ContentPack; siteName?: string };
type Edit = {
  id: string; kind: string; status: string; note?: string | null; created_at: string;
  payload: Record<string, any>; failure?: string | null; applied_artifact_version?: number | null;
};
type VersionRow = { version: number; bytes: number | null; createdAt: string | null; qaScore: number | null; qaGrade: string | null };
type CompareResult = {
  a: number; b: number; bytesA: number; bytesB: number; sectionsA: number; sectionsB: number;
  h2Added: string[]; h2Removed: string[]; visibleTextChangeRatio: number;
  qaScoreA: number | null; qaScoreB: number | null; qaScoreDelta: number | null;
};
type StyleOpt = { id: string; name: string };
type ProfileOpt = { profile_id: string };

const SLOTS = [
  { id: 'marquee', label: 'Keyword marquee' },
  { id: 'story', label: 'Story chapter' },
  { id: 'cinematic_break', label: 'Cinematic break' },
  { id: 'services', label: 'Services' },
  { id: 'trust', label: 'Stats band' },
  { id: 'process', label: 'How it works' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'faq', label: 'FAQ' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];
const SLOT_LABEL = Object.fromEntries(SLOTS.map((s) => [s.id, s.label]));
const DEFAULT_ORDER = SLOTS.map((s) => s.id);
const LOCK_LABELS: Record<string, string> = {
  style: 'Style lock (STYLE_LOCK — default on)', content: 'Content lock', image: 'Image lock',
  component: 'Component lock', section: 'Section lock', motion: 'Motion lock', scene: 'Scene lock (auto scenes stay on)',
};
const KIND_LABEL: Record<string, string> = {
  content: 'Content', image: 'Image', style: 'Style', motion: 'Motion',
  component: 'Component', 'section-order': 'Section order', 'section-visibility': 'Section visibility',
};

const summarizePayload = (e: Edit): string => {
  const p = e.payload || {};
  switch (e.kind) {
    case 'content': return `${p.path} → "${String(p.value).slice(0, 60)}"`;
    case 'image': return `${p.slot} ← ${p.key}`;
    case 'style': return `style → ${p.styleId}`;
    case 'motion': return [p.intensity ? `intensity → ${p.intensity}` : '', p.profileId ? `profile → ${p.profileId}` : ''].filter(Boolean).join(', ');
    case 'component': return `${p.section} → ${p.componentId}${p.variant ? ` (${p.variant})` : ''}`;
    case 'section-order': return (p.order || []).map((s: string) => SLOT_LABEL[s] || s).join(' → ');
    case 'section-visibility': return `${SLOT_LABEL[p.slot] || p.slot} ${p.hidden ? 'hidden' : 'shown'}`;
    default: return JSON.stringify(p);
  }
};

export default function EditorPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [styles, setStyles] = useState<StyleOpt[]>([]);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [overrideLocks, setOverrideLocks] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [stylePick, setStylePick] = useState('');
  const [intensityPick, setIntensityPick] = useState('');
  const [profilePick, setProfilePick] = useState('');
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const [cmp, setCmp] = useState<CompareResult | null>(null);

  useEffect(() => {
    (async () => {
      const [{ projects }, meta, mp] = await Promise.all([
        api<{ projects: Project[] }>('/projects'),
        api<{ styles: StyleOpt[] }>('/library/meta'),
        api<{ profiles: ProfileOpt[] }>('/library/motion-profiles'),
      ]);
      setProjects(projects);
      setStyles(meta.styles || []);
      setProfiles(mp.profiles || []);
      const urlProject = new URLSearchParams(window.location.search).get('project');
      if (urlProject && projects.some((p) => p.id === urlProject)) setProjectId(urlProject);
      else if (projects.length) setProjectId(projects[0].id);
    })().catch(() => {});
  }, []);

  const load = async (id: string) => {
    setError(''); setMessage(''); setCmp(null); setDrafts({});
    try {
      const [{ plan }, { recipe: r }, { edits }, { versions }] = await Promise.all([
        api<{ plan: Plan }>(`/builder/project/${id}/plan`),
        api<{ recipe: Recipe }>(`/builder/project/${id}/recipe`),
        api<{ edits: Edit[] }>(`/builder/project/${id}/edits`),
        api<{ versions: VersionRow[] }>(`/builder/project/${id}/versions`),
      ]);
      setPlan(plan); setRecipe(r); setEdits(edits); setVersions(versions);
      setStylePick(r.styleId || ''); setIntensityPick(r.motionIntensity || ''); setProfilePick(r.motionProfile || '');
    } catch (e: any) {
      setPlan(null); setRecipe(null); setEdits([]); setVersions([]);
      setError(e?.message || 'no build yet — build the site in the App Builder first');
    }
  };
  useEffect(() => { if (projectId) load(projectId).catch(() => {}); }, [projectId]);

  const propose = async (kind: string, payload: Record<string, any>, note?: string) => {
    if (!projectId) return;
    setBusy(kind); setError(''); setMessage('');
    try {
      await api(`/builder/project/${projectId}/edits`, {
        method: 'POST', body: JSON.stringify({ kind, payload: { ...payload, ...(overrideLocks ? { override: true } : {}) }, note }),
      });
      setMessage(`${KIND_LABEL[kind] || kind} proposal created — approve it below.`);
      await load(projectId);
    } catch (e: any) {
      setError(e?.message || 'proposal failed');
    } finally { setBusy(''); }
  };

  const decide = async (editId: string, decision: 'approve' | 'reject') => {
    if (!projectId) return;
    setBusy(editId); setError(''); setMessage('');
    try {
      await api(`/builder/project/${projectId}/edits/${editId}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      setMessage(decision === 'approve' ? 'Edit applied — new version built.' : 'Proposal rejected.');
      await load(projectId);
    } catch (e: any) {
      setError(e?.message || 'decision failed');
      await load(projectId).catch(() => {});
    } finally { setBusy(''); }
  };

  const toggleLock = async (key: string, locked: boolean) => {
    if (!projectId) return;
    try {
      const { locks } = await api<{ locks: Record<string, boolean> }>(`/builder/project/${projectId}/locks`, {
        method: 'POST', body: JSON.stringify({ key, locked }),
      });
      setRecipe((r) => (r ? { ...r, locks } : r));
    } catch (e: any) { setError(e?.message || 'lock update failed'); }
  };

  const moveSlot = (slot: string, dir: -1 | 1) => {
    const order = recipe?.sectionOrder?.length ? [...recipe.sectionOrder] : [...DEFAULT_ORDER];
    const i = order.indexOf(slot);
    const j = i + dir;
    if (i === -1 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    propose('section-order', { order });
  };

  const runCompare = async () => {
    if (!projectId || !cmpA || !cmpB) return;
    setError(''); setCmp(null);
    try {
      setCmp(await api<CompareResult>(`/builder/project/${projectId}/compare?a=${cmpA}&b=${cmpB}`));
    } catch (e: any) { setError(e?.message || 'compare failed'); }
  };

  const restore = async (version: number) => {
    if (!projectId) return;
    setBusy(`restore-${version}`); setError(''); setMessage('');
    try {
      const r = await api<{ note: string }>(`/builder/project/${projectId}/restore`, { method: 'POST', body: JSON.stringify({ version }) });
      setMessage(r.note);
      await load(projectId);
    } catch (e: any) { setError(e?.message || 'restore failed'); }
    finally { setBusy(''); }
  };

  const pack = plan?.contentPack;
  const order = recipe?.sectionOrder?.length ? recipe.sectionOrder : DEFAULT_ORDER;
  const hidden = new Set(recipe?.hiddenSlots || []);
  const proposed = edits.filter((e) => e.status === 'proposed');
  const lockState = (key: string) => recipe?.locks?.[key] ?? (key === 'style');

  const contentField = (path: string, label: string, value: string, multiline = false) => (
    <div key={path} className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <Button size="sm" variant="outline" className="h-7 gap-1"
          disabled={busy === path || drafts[path] === undefined || drafts[path] === value}
          onClick={() => propose('content', { path, value: drafts[path] ?? value })}>
          <Pencil className="h-3 w-3" /> Propose
        </Button>
      </div>
      {multiline
        ? <Textarea rows={2} value={drafts[path] ?? value} onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))} />
        : <Input value={drafts[path] ?? value} onChange={(e) => setDrafts((d) => ({ ...d, [path]: e.target.value }))} />}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Website Editor</h1>
          <p className="text-sm text-muted-foreground">
            Phase 8 — proposals, §59 locks, compare &amp; restore. Nothing applies without your approval.
          </p>
        </div>
        <Select value={projectId} onValueChange={(id) => { setProjectId(id); window.history.replaceState(null, '', `/editor?project=${id}`); }}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Choose a project" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <div className="text-sm bg-destructive/10 text-destructive rounded-lg px-4 py-3">{error}</div>}
      {message && <div className="text-sm bg-primary/10 text-primary rounded-lg px-4 py-3">{message}</div>}

      {recipe && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" /> Layer locks (§59)</CardTitle>
            <CardDescription>STYLE_LOCK is on by default (§60). Locking never rebuilds — it gates future edits. Overrides are audited.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {Object.entries(LOCK_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch checked={lockState(key)} onCheckedChange={(v) => toggleLock(key, v)} />
                <span>{label}</span>
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
              <Switch checked={overrideLocks} onCheckedChange={setOverrideLocks} />
              Override locked layers on propose (audited)
            </label>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sections */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Sections — order &amp; visibility</CardTitle>
            <CardDescription>Reordering proposes a new section order; the eye toggles visibility. Approve below to apply.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {order.map((slot) => (
              <div key={slot} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${hidden.has(slot) ? 'opacity-50' : ''}`}>
                <span className="flex-1">{SLOT_LABEL[slot] || slot}</span>
                {hidden.has(slot) && <Badge variant="outline">hidden</Badge>}
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy === 'section-order'} onClick={() => moveSlot(slot, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy === 'section-order'} onClick={() => moveSlot(slot, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7"
                  onClick={() => propose('section-visibility', { slot, hidden: !hidden.has(slot) })}>
                  {hidden.has(slot) ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Content */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Type className="h-4 w-4" /> Content</CardTitle>
            <CardDescription>Edit copy from the built content pack. Changes apply as overrides on the stored recipe — the pack itself is never mutated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!pack && <p className="text-sm text-muted-foreground">Build the site first — content appears here after the first build.</p>}
            {pack?.headline && contentField('headline.text', 'Headline', pack.headline.text)}
            {pack?.subline && contentField('subline.text', 'Subline', pack.subline.text)}
            {pack?.about?.map((a, i) => contentField(`about[${i}].text`, `About ¶${i + 1}${a.classification === 'VERIFIED_FACT' ? ' (verified fact)' : ''}`, a.text, true))}
            {pack?.services?.map((s, i) => (
              <div key={`svc-${i}`} className="space-y-2 rounded-lg border p-3">
                <div className="text-xs font-semibold text-muted-foreground">Service {i + 1}</div>
                {contentField(`services[${i}].title`, 'Title', s.title)}
                {contentField(`services[${i}].description`, 'Description', s.description, true)}
              </div>
            ))}
            {pack?.faqs?.map((f, i) => (
              <div key={`faq-${i}`} className="space-y-2 rounded-lg border p-3">
                <div className="text-xs font-semibold text-muted-foreground">FAQ {i + 1}</div>
                {contentField(`faqs[${i}].q`, 'Question', f.q)}
                {contentField(`faqs[${i}].a`, 'Answer', f.a, true)}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Style & motion */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Palette className="h-4 w-4" /> Style &amp; motion</CardTitle>
            <CardDescription>LD style is STYLE_LOCKED by default — propose with override to switch intentionally (audited, §60).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">LD style (current: {recipe?.styleId || '—'})</label>
              <div className="flex gap-2">
                <Select value={stylePick} onValueChange={setStylePick}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a style" /></SelectTrigger>
                  <SelectContent>{styles.map((s) => <SelectItem key={s.id} value={s.id}>{s.id} · {s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" disabled={!stylePick || busy === 'style'} onClick={() => propose('style', { styleId: stylePick })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Propose
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" /> Motion intensity</label>
              <div className="flex gap-2">
                <Select value={intensityPick} onValueChange={setIntensityPick}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Pick intensity" /></SelectTrigger>
                  <SelectContent>{['MINIMAL', 'BALANCED', 'CINEMATIC', 'IMMERSIVE'].map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" disabled={!intensityPick || busy === 'motion'} onClick={() => propose('motion', { intensity: intensityPick })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Propose
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Motion profile (current: {recipe?.motionProfile || '—'})</label>
              <div className="flex gap-2">
                <Select value={profilePick} onValueChange={setProfilePick}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a profile" /></SelectTrigger>
                  <SelectContent>{profiles.map((p) => <SelectItem key={p.profile_id} value={p.profile_id}>{p.profile_id}</SelectItem>)}</SelectContent>
                </Select>
                <Button variant="outline" disabled={!profilePick || busy === 'motion'} onClick={() => propose('motion', { profileId: profilePick })}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Propose
                </Button>
              </div>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Image className="h-3.5 w-3.5" /> Image overrides (recipe keys)</label>
              <div className="flex flex-wrap gap-2">
                {['hero', 'about', 'accent', 'gallery'].map((slot) => (
                  <div key={slot} className="flex items-center gap-1.5 text-sm">
                    <span className="text-muted-foreground w-14">{slot}</span>
                    <Input className="w-44 h-8" placeholder="media key"
                      defaultValue={recipe?.imageOverrides?.[slot] || ''}
                      onBlur={(e) => e.target.value && propose('image', { slot, key: e.target.value })} />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Keys come from the generated media library (e.g. hero-professional). Unknown keys are rejected at propose time.</p>
            </div>
          </CardContent>
        </Card>

        {/* Approvals */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Check className="h-4 w-4" /> Approvals</CardTitle>
            <CardDescription>{proposed.length} proposal{proposed.length === 1 ? '' : 's'} waiting. Approving rebuilds the site as a new version.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!edits.length && <p className="text-sm text-muted-foreground">No edits yet — propose changes from the panels above.</p>}
            {edits.slice(0, 30).map((e) => (
              <div key={e.id} className="rounded-lg border px-3 py-2 text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={e.status === 'applied' ? 'default' : e.status === 'proposed' ? 'secondary' : 'outline'}>{e.status}</Badge>
                  <span className="font-medium">{KIND_LABEL[e.kind] || e.kind}</span>
                  <span className="text-muted-foreground">{summarizePayload(e)}</span>
                  {e.applied_artifact_version ? <Badge variant="outline">v{e.applied_artifact_version}</Badge> : null}
                  <span className="text-xs text-muted-foreground ml-auto">{e.created_at}</span>
                </div>
                {e.failure && <p className="text-xs text-destructive">{e.failure}</p>}
                {e.status === 'proposed' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 gap-1" disabled={busy === e.id} onClick={() => decide(e.id, 'approve')}><Check className="h-3.5 w-3.5" /> Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy === e.id} onClick={() => decide(e.id, 'reject')}><X className="h-3.5 w-3.5" /> Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Versions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" /> Versions — compare &amp; restore</CardTitle>
          <CardDescription>Restore copies old bytes into a NEW version. A future full rebuild still regenerates from the stored recipe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={cmpA} onValueChange={setCmpA}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Version A" /></SelectTrigger>
              <SelectContent>{versions.map((v) => <SelectItem key={v.version} value={String(v.version)}>v{v.version}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={cmpB} onValueChange={setCmpB}>
              <SelectTrigger className="w-28"><SelectValue placeholder="Version B" /></SelectTrigger>
              <SelectContent>{versions.map((v) => <SelectItem key={v.version} value={String(v.version)}>v{v.version}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" className="gap-1.5" disabled={!cmpA || !cmpB} onClick={runCompare}>
              <GitCompare className="h-3.5 w-3.5" /> Compare
            </Button>
          </div>
          {cmp && (
            <div className="rounded-lg border p-4 text-sm grid gap-2 md:grid-cols-2">
              <div>Bytes: {cmp.bytesA} → {cmp.bytesB}</div>
              <div>Sections: {cmp.sectionsA} → {cmp.sectionsB}</div>
              <div>Visible-text change: {(cmp.visibleTextChangeRatio * 100).toFixed(1)}%</div>
              <div>QA score: {cmp.qaScoreA ?? '—'} → {cmp.qaScoreB ?? '—'}{cmp.qaScoreDelta !== null ? ` (Δ ${cmp.qaScoreDelta})` : ''}</div>
              {!!cmp.h2Added.length && <div className="md:col-span-2">H2 added: {cmp.h2Added.join(' · ')}</div>}
              {!!cmp.h2Removed.length && <div className="md:col-span-2">H2 removed: {cmp.h2Removed.join(' · ')}</div>}
            </div>
          )}
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                  <th className="px-3 py-2 font-medium">QA</th>
                  <th className="px-3 py-2 font-medium">Built at</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {[...versions].reverse().map((v) => (
                  <tr key={v.version} className="border-t">
                    <td className="px-3 py-2 font-medium">v{v.version}</td>
                    <td className="px-3 py-2">{v.bytes !== null ? `${(v.bytes / 1024).toFixed(1)} KB` : '—'}</td>
                    <td className="px-3 py-2">{v.qaScore !== null ? `${v.qaScore} (${v.qaGrade || '—'})` : '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{v.createdAt || '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busy === `restore-${v.version}`} onClick={() => restore(v.version)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!versions.length && <p className="text-sm text-muted-foreground p-4">No versions yet — build the site first.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
