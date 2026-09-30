import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Project } from '@/lib/api';
import WebsiteEditorChat from '@/components/WebsiteEditorChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Braces, CheckCircle2, ExternalLink, Image as ImageIcon, Laptop, Monitor,
  MousePointer2, Palette, RefreshCw, Save, Smartphone, Sparkles, Tablet,
  Type, WandSparkles, Zap,
} from 'lucide-react';

type PackItem = { text: string; classification?: string };
type ContentPack = {
  headline?: PackItem;
  subline?: PackItem;
  about?: PackItem[];
  differentiators?: PackItem[];
  journey?: PackItem[];
  services?: { title: string; description: string; classification?: string }[];
  faqs?: { q: string; a: string }[];
};
type Plan = { siteName?: string; contentPack?: ContentPack };
type Recipe = {
  styleId?: string;
  activeStyleId?: string;
  motionIntensity?: string;
  motionProfile?: string;
  imageOverrides?: Record<string, string>;
  locks?: Record<string, boolean>;
};
type StyleOpt = { id: string; name: string };
type ProfileOpt = { profile_id: string };
type EditResult = { edit: { id: string } };

type EditorMode = 'content' | 'design' | 'developer';
type Device = 'desktop' | 'tablet' | 'mobile';

const DEVICE_WIDTHS: Record<Device, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

const DEVICE_ICONS = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
};

const MOTION_LEVELS = ['MINIMAL', 'BALANCED', 'CINEMATIC', 'IMMERSIVE'];
const IMAGE_SLOTS = ['hero', 'about', 'accent', 'gallery'];

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();

export default function VisualWebEnginePage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [styles, setStyles] = useState<StyleOpt[]>([]);
  const [profiles, setProfiles] = useState<ProfileOpt[]>([]);
  const [mode, setMode] = useState<EditorMode>('content');
  const [device, setDevice] = useState<Device>('desktop');
  const [selectedPath, setSelectedPath] = useState('headline.text');
  const [selectedLabel, setSelectedLabel] = useState('Hero headline');
  const [draft, setDraft] = useState('');
  const [imageSlot, setImageSlot] = useState('hero');
  const [imageKey, setImageKey] = useState('');
  const [stylePick, setStylePick] = useState('');
  const [motionPick, setMotionPick] = useState('BALANCED');
  const [profilePick, setProfilePick] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const [{ projects: rows }, meta, mp] = await Promise.all([
        api<{ projects: Project[] }>('/projects'),
        api<{ styles: StyleOpt[] }>('/library/meta'),
        api<{ profiles: ProfileOpt[] }>('/library/motion-profiles'),
      ]);
      setProjects(rows);
      setStyles(meta.styles || []);
      setProfiles(mp.profiles || []);
      const fromUrl = new URLSearchParams(window.location.search).get('project');
      const initial = fromUrl && rows.some((p) => p.id === fromUrl) ? fromUrl : rows[0]?.id;
      if (initial) setProjectId(initial);
    })().catch((e: any) => setError(e?.message || 'Could not load Visual Web Engine.'));
  }, []);

  const loadProject = async (id: string) => {
    setError('');
    setMessage('');
    try {
      const [{ plan: nextPlan }, { recipe: nextRecipe }] = await Promise.all([
        api<{ plan: Plan }>(`/builder/project/${id}/plan`),
        api<{ recipe: Recipe }>(`/builder/project/${id}/recipe`),
      ]);
      setPlan(nextPlan);
      setRecipe(nextRecipe);
      setStylePick(nextRecipe.styleId || nextRecipe.activeStyleId || '');
      setMotionPick((nextRecipe.motionIntensity || 'BALANCED').toUpperCase());
      setProfilePick(nextRecipe.motionProfile || '');
      setImageKey(nextRecipe.imageOverrides?.hero || '');
      const headline = nextPlan.contentPack?.headline?.text || '';
      setSelectedPath('headline.text');
      setSelectedLabel('Hero headline');
      setDraft(headline);
      setRefreshKey((v) => v + 1);
    } catch (e: any) {
      setPlan(null);
      setRecipe(null);
      setError(e?.message || 'Build this project in App Builder first, then open it here.');
    }
  };

  useEffect(() => {
    if (!projectId) return;
    window.history.replaceState(null, '', `/visual-web-engine?project=${projectId}`);
    loadProject(projectId).catch(() => {});
  }, [projectId]);

  const contentFields = useMemo(() => {
    const pack = plan?.contentPack;
    const rows: { path: string; label: string; value: string }[] = [];
    if (!pack) return rows;
    if (pack.headline?.text) rows.push({ path: 'headline.text', label: 'Hero headline', value: pack.headline.text });
    if (pack.subline?.text) rows.push({ path: 'subline.text', label: 'Hero subline', value: pack.subline.text });
    pack.about?.forEach((item, i) => rows.push({ path: `about[${i}].text`, label: `About ${i + 1}`, value: item.text }));
    pack.differentiators?.forEach((item, i) => rows.push({ path: `differentiators[${i}].text`, label: `Differentiator ${i + 1}`, value: item.text }));
    pack.journey?.forEach((item, i) => rows.push({ path: `journey[${i}].text`, label: `Journey ${i + 1}`, value: item.text }));
    pack.services?.forEach((item, i) => {
      rows.push({ path: `services[${i}].title`, label: `Service ${i + 1} title`, value: item.title });
      rows.push({ path: `services[${i}].description`, label: `Service ${i + 1} description`, value: item.description });
    });
    pack.faqs?.forEach((item, i) => {
      rows.push({ path: `faqs[${i}].q`, label: `FAQ ${i + 1} question`, value: item.q });
      rows.push({ path: `faqs[${i}].a`, label: `FAQ ${i + 1} answer`, value: item.a });
    });
    return rows;
  }, [plan]);

  const currentField = contentFields.find((field) => field.path === selectedPath);

  useEffect(() => {
    if (currentField) setDraft(currentField.value);
  }, [currentField?.path, currentField?.value]);

  const wirePreview = () => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!doc || !contentFields.length) return;

    const valueMap = new Map<string, { path: string; label: string; value: string }>();
    contentFields.forEach((field) => valueMap.set(normalize(field.value), field));

    const style = doc.createElement('style');
    style.dataset.lucioEditor = 'true';
    style.textContent = `
      [data-lucio-editable="true"] { cursor: text !important; transition: outline-color .15s ease, background .15s ease; }
      [data-lucio-editable="true"]:hover { outline: 2px solid #f59e0b !important; outline-offset: 4px !important; background: rgba(245,158,11,.08) !important; }
      [data-lucio-selected="true"] { outline: 2px solid #f59e0b !important; outline-offset: 5px !important; }
    `;
    doc.head.appendChild(style);

    const candidates = Array.from(doc.querySelectorAll<HTMLElement>('h1,h2,h3,h4,p,a,button,li,span'));
    candidates.forEach((el) => {
      const field = valueMap.get(normalize(el.textContent || ''));
      if (!field) return;
      el.dataset.lucioEditable = 'true';
      el.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        doc.querySelectorAll('[data-lucio-selected="true"]').forEach((node) => node.removeAttribute('data-lucio-selected'));
        el.dataset.lucioSelected = 'true';
        setMode('content');
        setSelectedPath(field.path);
        setSelectedLabel(field.label);
        setDraft(field.value);
        setMessage(`Selected “${field.label}” from the live preview.`);
      }, true);
    });
  };

  const saveAndApply = async (kind: string, payload: Record<string, unknown>, label: string) => {
    if (!projectId) return;
    setBusy(label);
    setError('');
    setMessage('');
    try {
      const proposed = await api<EditResult>(`/builder/project/${projectId}/edits`, {
        method: 'POST',
        body: JSON.stringify({ kind, payload, note: `Visual Web Engine: ${label}` }),
      });
      await api(`/builder/project/${projectId}/edits/${proposed.edit.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'approve' }),
      });
      setMessage(`${label} saved. Lucio rebuilt the affected site version.`);
      await loadProject(projectId);
    } catch (e: any) {
      setError(e?.message || `${label} failed.`);
    } finally {
      setBusy('');
    }
  };

  const saveText = () => {
    if (!selectedPath || !draft.trim()) return;
    saveAndApply('content', { path: selectedPath, value: draft.trim() }, selectedLabel || 'Text change');
  };

  const saveImage = () => {
    if (!imageKey.trim()) return;
    saveAndApply('image', { slot: imageSlot, key: imageKey.trim() }, `${imageSlot} image`);
  };

  const saveMotion = () => {
    saveAndApply('motion', {
      intensity: motionPick,
      ...(profilePick ? { profileId: profilePick } : {}),
    }, 'Motion settings');
  };

  const saveStyle = () => {
    if (!stylePick) return;
    saveAndApply('style', { styleId: stylePick }, 'Visual style');
  };

  const selectField = (path: string) => {
    const field = contentFields.find((item) => item.path === path);
    if (!field) return;
    setSelectedPath(field.path);
    setSelectedLabel(field.label);
    setDraft(field.value);
  };

  const previewUrl = projectId ? `/api/builder/project/${projectId}/preview?v=${refreshKey}` : '';
  const currentProject = projects.find((p) => p.id === projectId);
  const selectedWidth = DEVICE_WIDTHS[device];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Visual Web Engine</h1>
            <Badge className="gap-1"><Sparkles className="h-3 w-3" /> Beta</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Framer-style visual editing plus natural conversation with your NEXUS website agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Choose a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" title="Refresh preview" onClick={() => setRefreshKey((v) => v + 1)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {message && <div className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-primary">{message}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-2">
        <div className="flex items-center gap-1">
          {([
            ['content', Type, 'Content'],
            ['design', Palette, 'Design'],
            ['developer', Braces, 'Developer'],
          ] as const).map(([id, Icon, label]) => (
            <Button key={id} size="sm" variant={mode === id ? 'default' : 'ghost'} className="gap-2" onClick={() => setMode(id)}>
              <Icon className="h-4 w-4" /> {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {(Object.keys(DEVICE_WIDTHS) as Device[]).map((id) => {
            const Icon = DEVICE_ICONS[id];
            return (
              <Button key={id} size="sm" variant={device === id ? 'secondary' : 'ghost'} className="gap-2" onClick={() => setDevice(id)}>
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline capitalize">{id}</span>
              </Button>
            );
          })}
          {projectId && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(`/api/builder/project/${projectId}/preview`, '_blank')}>
              <ExternalLink className="h-4 w-4" /> Raw preview
            </Button>
          )}
        </div>
      </div>

      {projectId && recipe && (
        <WebsiteEditorChat
          projectId={projectId}
          selectedPath={selectedPath}
          selectedLabel={selectedLabel}
          onApplied={() => loadProject(projectId)}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_280px]">
        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><MousePointer2 className="h-4 w-4" /> Page content</CardTitle>
            <CardDescription>Click editable text in the preview or choose it here.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[65vh] overflow-y-auto">
            {!contentFields.length && <p className="text-xs text-muted-foreground">Build the selected project first.</p>}
            {contentFields.map((field) => (
              <button
                key={field.path}
                type="button"
                onClick={() => selectField(field.path)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${selectedPath === field.path ? 'border-primary bg-primary/5' : 'hover:bg-muted/60'}`}
              >
                <div className="text-xs font-medium">{field.label}</div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">{field.value}</div>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="min-w-0">
          <div className="rounded-2xl border bg-muted/30 p-3 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Laptop className="h-3.5 w-3.5" />
                <span>{currentProject?.name || 'Live preview'}</span>
                <Badge variant="outline" className="text-[10px]">{selectedWidth}px</Badge>
              </div>
              <span className="hidden md:inline">Hover highlighted copy, then click to edit</span>
            </div>
            <div className="overflow-auto rounded-xl bg-[#0a0a0a] p-3 min-h-[620px]">
              <div
                className="mx-auto overflow-hidden rounded-lg bg-white shadow-2xl transition-[width] duration-300"
                style={{ width: `${selectedWidth}px`, maxWidth: '100%', height: '590px' }}
              >
                {previewUrl ? (
                  <iframe
                    ref={iframeRef}
                    key={`${projectId}-${refreshKey}`}
                    title="Lucio Visual Web Engine preview"
                    src={previewUrl}
                    onLoad={wirePreview}
                    className="h-full w-full border-0 bg-white"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">Choose a project to preview.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <Card className="h-fit xl:sticky xl:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {mode === 'content' ? 'Content inspector' : mode === 'design' ? 'Design inspector' : 'Developer inspector'}
            </CardTitle>
            <CardDescription>
              {mode === 'content' && 'Edit copy or replace a generated media slot.'}
              {mode === 'design' && 'Tune style and motion without touching source code.'}
              {mode === 'developer' && 'Inspect the underlying Lucio preview and export endpoints.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {mode === 'content' && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium">{selectedLabel || 'Selected text'}</label>
                    {selectedPath && <Badge variant="outline" className="max-w-36 truncate text-[10px]">{selectedPath}</Badge>}
                  </div>
                  <Textarea rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Click text in the preview to edit it" />
                  <Button className="w-full gap-2" disabled={!selectedPath || !draft.trim() || busy !== ''} onClick={saveText}>
                    {busy === selectedLabel ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save text
                  </Button>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-medium"><ImageIcon className="h-4 w-4" /> Media slot</div>
                  <Select value={imageSlot} onValueChange={(value) => {
                    setImageSlot(value);
                    setImageKey(recipe?.imageOverrides?.[value] || '');
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{IMAGE_SLOTS.map((slot) => <SelectItem key={slot} value={slot}>{slot}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input value={imageKey} onChange={(e) => setImageKey(e.target.value)} placeholder="e.g. hero-professional" />
                  <Button variant="outline" className="w-full gap-2" disabled={!imageKey.trim() || busy !== ''} onClick={saveImage}>
                    <WandSparkles className="h-4 w-4" /> Replace image
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Keys come from Lucio’s generated media library. The Media agent can guide supported replacements.</p>
                </div>
              </>
            )}

            {mode === 'design' && (
              <>
                <div className="space-y-2">
                  <label className="text-xs font-medium">Visual style</label>
                  <Select value={stylePick} onValueChange={setStylePick}>
                    <SelectTrigger><SelectValue placeholder="Choose style" /></SelectTrigger>
                    <SelectContent>{styles.map((style) => <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="outline" className="w-full gap-2" disabled={!stylePick || busy !== ''} onClick={saveStyle}>
                    <Palette className="h-4 w-4" /> Apply style
                  </Button>
                  {recipe?.locks?.style !== false && (
                    <p className="text-[11px] text-muted-foreground">Manual style changes respect STYLE_LOCK. A direct conversational instruction can override a locked layer with a recorded audit event.</p>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <label className="text-xs font-medium">Motion intensity</label>
                  <Select value={motionPick} onValueChange={setMotionPick}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MOTION_LEVELS.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent>
                  </Select>
                  <label className="text-xs font-medium">Motion profile</label>
                  <Select value={profilePick} onValueChange={setProfilePick}>
                    <SelectTrigger><SelectValue placeholder="Current profile" /></SelectTrigger>
                    <SelectContent>{profiles.map((profile) => <SelectItem key={profile.profile_id} value={profile.profile_id}>{profile.profile_id}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button className="w-full gap-2" disabled={busy !== ''} onClick={saveMotion}>
                    <Zap className="h-4 w-4" /> Apply motion
                  </Button>
                </div>
              </>
            )}

            {mode === 'developer' && (
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Preview source</div>
                  <code className="mt-1 block break-all text-[10px] text-muted-foreground">/api/builder/project/{projectId || ':projectId'}/preview</code>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Device preview</div>
                  <code className="mt-1 block break-all text-[10px] text-muted-foreground">/api/builder/project/{projectId || ':projectId'}/device?device={device}</code>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Portable export</div>
                  <code className="mt-1 block break-all text-[10px] text-muted-foreground">/api/builder/project/{projectId || ':projectId'}/export</code>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="font-medium">Conversational editor</div>
                  <code className="mt-1 block break-all text-[10px] text-muted-foreground">POST /api/assistant/editor</code>
                </div>
                <div className="rounded-lg bg-primary/5 p-3 text-muted-foreground">
                  <div className="mb-1 flex items-center gap-2 font-medium text-foreground"><CheckCircle2 className="h-4 w-4 text-primary" /> Version-safe editing</div>
                  Manual and conversational saves both use Lucio’s existing proposal → approval → rebuild pipeline, so edits stay auditable and versioned.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
