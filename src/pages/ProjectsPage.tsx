import { useEffect, useState } from 'react';
import { useRef } from 'react';
import { zipSync } from 'fflate';
import { useNavigate } from 'react-router';
import { api, type Project } from '@/lib/api';
import { publicUrl } from '@/lib/publicUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Hammer, Download, LayoutTemplate, Loader2, Sparkles, Brain, Upload, FolderOpen, Globe, Check, Link2, CloudUpload } from 'lucide-react';

type HostLearning = {
  host: string; attempts: number; successes: number;
  learnedUa: string | null; learnedWww: string | null; moduleStrategy: string | null;
  avgTexts: number; jsRenderedCount: number; lastStatus: number; lastError: string | null; updatedAt: string;
};

type Template = {
  id: string; name: string; description: string; projectId: string; createdAt: string;
  previewUrl?: string;
  textsCount: number;
  snippets: { kind: string; name: string; hint?: string; chars?: number; src?: string }[];
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [usingTpl, setUsingTpl] = useState('');
  const [copiedTpl, setCopiedTpl] = useState('');
  const [publishingTpl, setPublishingTpl] = useState('');
  const [pubMsg, setPubMsg] = useState('');
  const publishTpl = async (t: Template) => {
    setPublishingTpl(t.id);
    setPubMsg('');
    try {
      const r = await api<{ deployment: { absoluteUrl: string; status: string; diagnostics?: string } }>('/publish', { method: 'POST', body: JSON.stringify({ kind: 'template', id: t.id }) });
      const d = r.deployment;
      if (d.status === 'published') {
        await navigator.clipboard.writeText(d.absoluteUrl).catch(() => {});
        setPubMsg(`“${t.name}” is public and verified: ${d.absoluteUrl} — link copied for your client`);
      } else {
        setPubMsg(`Publish failed for “${t.name}”: ${d.diagnostics || d.status}`);
      }
    } catch (e: any) {
      setPubMsg(`Publish failed: ${e.message}`);
    } finally {
      setPublishingTpl('');
    }
  };
  const copyTplLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(await publicUrl(`/tpl/${id}`));
      setCopiedTpl(id);
      setTimeout(() => setCopiedTpl((c) => (c === id ? '' : c)), 1500);
    } catch { /* clipboard unavailable — the Live button still works */ }
  };
  const [error, setError] = useState('');
  const [learnings, setLearnings] = useState<HostLearning[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api<{ projects: Project[] }>('/projects').then((d) => setProjects(d.projects)).catch(() => {});
    api<{ templates: Template[] }>('/imports/templates').then((d) => setTemplates(d.templates)).catch(() => {});
    api<{ learnings: HostLearning[] }>('/imports/learnings').then((d) => setLearnings(d.learnings)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription(''); load();
    } catch (err: any) { setError(err.message); }
  };

  const doImport = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setImporting(true);
    try {
      const out = await api<{ projectId: string; title: string; textsCount: number }>('/imports', {
        method: 'POST', body: JSON.stringify({ url: importUrl }),
      });
      setImportUrl(''); load();
      navigate(`/import-studio/${out.projectId}`);
    } catch (err: any) { setError(err.message); } finally { setImporting(false); }
  };

  // File/folder import: a .zip goes up as-is; a bare .html or a whole folder
  // is zipped in-browser first. The server inlines every local asset so
  // photos, animations, effects and motions all come through.
  const doFileImport = async (list: FileList | File[]) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    setError(''); setImporting(true);
    try {
      let body: Uint8Array;
      let name: string;
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        body = new Uint8Array(await files[0].arrayBuffer());
        name = files[0].name;
      } else {
        const entries: Record<string, Uint8Array> = {};
        let total = 0;
        for (const f of files) {
          const buf = new Uint8Array(await f.arrayBuffer());
          total += buf.length;
          if (total > 60 * 1024 * 1024) throw new Error('Selection exceeds the 60MB upload cap');
          entries[(f as any).webkitRelativePath || f.name] = buf;
        }
        body = zipSync(entries, { level: 0 });
        name = files.length === 1 ? files[0].name : 'folder-import.zip';
      }
      const out = await api<{ projectId: string }>(`/imports/upload?name=${encodeURIComponent(name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: body as unknown as string,
      });
      load();
      navigate(`/import-studio/${out.projectId}`);
    } catch (err: any) { setError(err.message); } finally { setImporting(false); }
  };

  const spawnTemplate = async (tpl: Template) => {
    setError(''); setUsingTpl(tpl.id);
    try {
      const out = await api<{ projectId: string }>(`/imports/templates/${tpl.id}/use`, {
        method: 'POST', body: JSON.stringify({ name: `${tpl.name} (new)` }),
      });
      load(); navigate(`/import-studio/${out.projectId}`);
    } catch (err: any) { setError(err.message); } finally { setUsingTpl(''); }
  };

  const remove = async (id: string) => {
    setError('');
    try { await api(`/projects/${id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { setError(err.message); }
  };

  const removeTemplate = async (id: string) => {
    setError('');
    try { await api(`/imports/templates/${id}`, { method: 'DELETE' }); load(); }
    catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="text-muted-foreground">Every app or website gets its own isolated identity — never platform credentials.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>New project</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex flex-wrap gap-2">
            <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required className="w-64" />
            <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="w-72" />
            <Button type="submit"><Plus className="h-4 w-4 mr-1" /> Create</Button>
          </form>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" /> Import a website</CardTitle>
          <CardDescription>
            Pull in a site you built anywhere (e.g. a kimi.page link). Edit its texts, keep every animation,
            publish it live, and save it as a reusable template — styles, scripts and sections included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={doImport} className="flex flex-wrap gap-2">
            <Input
              placeholder="https://your-site.kimi.page"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              required
              type="url"
              className="w-96"
            />
            <Button type="submit" variant="secondary" disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Import &amp; edit
            </Button>
          </form>
          <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Or bring the files themselves — photos, animations, effects and motions are captured into the project:</span>
            <input ref={fileRef} type="file" accept=".zip,.html" className="hidden" onChange={(e) => { doFileImport(e.target.files || []); e.target.value = ''; }} />
            <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: '' } as any)} onChange={(e) => { doFileImport(e.target.files || []); e.target.value = ''; }} />
            <Button type="button" size="sm" variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />} Upload .zip / .html
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={importing} onClick={() => folderRef.current?.click()}>
              <FolderOpen className="h-3.5 w-3.5 mr-1" /> Upload site folder
            </Button>
          </div>
        </CardContent>
      </Card>
      {learnings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base"><Brain className="h-5 w-5" /> Import intelligence</CardTitle>
            <CardDescription>What the importer has learned about each host — every import makes the next one smarter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {learnings.map((l) => (
              <div key={l.host} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs">{l.host}</span>
                <Badge variant="outline" className="text-[10px]">{l.successes}/{l.attempts} ok</Badge>
                {l.learnedUa && <Badge variant="secondary" className="text-[10px]">{l.learnedUa} UA</Badge>}
                {l.learnedWww && <Badge variant="secondary" className="text-[10px]">{l.learnedWww} host</Badge>}
                {l.moduleStrategy === 'remote' && <Badge variant="secondary" className="text-[10px]">modules remote</Badge>}
                {l.jsRenderedCount > 0 && <Badge variant="outline" className="text-[10px]">JS shell ×{l.jsRenderedCount}</Badge>}
                {l.lastStatus >= 400 && <Badge variant="destructive" className="text-[10px]">last: HTTP {l.lastStatus}</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">{l.avgTexts} texts avg</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {templates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><LayoutTemplate className="h-5 w-5" /> My templates</h2>
          {pubMsg && <p className="text-sm text-primary">{pubMsg}</p>}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-[10px]">{t.textsCount} texts</Badge>
                      <Badge variant="secondary" className="text-[10px]">{t.snippets.length} snippets</Badge>
                    </div>
                  </div>
                  <CardDescription className="line-clamp-2">{t.description || 'No description'}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-muted-foreground truncate max-w-[55%]">
                    {t.snippets.slice(0, 3).map((s) => s.name).join(' · ')}
                  </p>
                  <div className="flex items-center gap-1">
                    {t.previewUrl && (
                      <>
                        <Button size="sm" variant="outline" asChild title="Open the always-live template preview">
                          <a href={t.previewUrl} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5 mr-1" />Live</a>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => copyTplLink(t.id)} title="Copy the live template link to share with a client" aria-label={`Copy live link for ${t.name}`}>
                          {copiedTpl === t.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Link2 className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => publishTpl(t)} disabled={publishingTpl !== ''} title="Publish to a public client-viewable URL (kimi.page) — link is copied" aria-label={`Publish ${t.name} publicly`}>
                          {publishingTpl === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
                        </Button>
                      </>
                    )}
                    <Button size="sm" onClick={() => spawnTemplate(t)} disabled={usingTpl !== ''}>
                      {usingTpl === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                      Use
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeTemplate(t.id)} aria-label={`Delete template ${t.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Card
            key={p.id}
            role="link"
            tabIndex={0}
            aria-label={`Open ${p.name} in the builder`}
            className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => navigate(`/builder?project=${p.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/builder?project=${p.id}`); } }}
          >
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <Badge variant={p.status === 'preview' ? 'default' : 'secondary'} className="capitalize">{p.status}</Badge>
              </div>
              <CardDescription>{p.description || 'No description'}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Updated {new Date(p.updated_at).toLocaleDateString()}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/builder?project=${p.id}`); }} aria-label={`Build website for ${p.name}`}>
                  <Hammer className="h-3.5 w-3.5 mr-1" /> Build
                </Button>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); remove(p.id); }} aria-label="Delete project">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!projects.length && <p className="text-sm text-muted-foreground col-span-full">No projects yet — create your first one above.</p>}
      </div>
    </div>
  );
}
