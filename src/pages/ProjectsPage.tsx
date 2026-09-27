import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, type Project } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Hammer, Download, LayoutTemplate, Loader2, Sparkles } from 'lucide-react';

type Template = {
  id: string; name: string; description: string; projectId: string; createdAt: string;
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
  const [error, setError] = useState('');

  const load = () => {
    api<{ projects: Project[] }>('/projects').then((d) => setProjects(d.projects)).catch(() => {});
    api<{ templates: Template[] }>('/imports/templates').then((d) => setTemplates(d.templates)).catch(() => {});
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

  const useTemplate = async (tpl: Template) => {
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
        </CardContent>
      </Card>
      {templates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><LayoutTemplate className="h-5 w-5" /> My templates</h2>
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
                    <Button size="sm" onClick={() => useTemplate(t)} disabled={usingTpl !== ''}>
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
