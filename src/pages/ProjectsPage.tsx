import { useEffect, useState } from 'react';
import { api, type Project } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const load = () => api<{ projects: Project[] }>('/projects').then((d) => setProjects(d.projects)).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      await api('/projects', { method: 'POST', body: JSON.stringify({ name, description }) });
      setName(''); setDescription(''); load();
    } catch (err: any) { setError(err.message); }
  };

  const remove = async (id: string) => {
    setError('');
    try { await api(`/projects/${id}`, { method: 'DELETE' }); load(); }
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
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                <Badge variant={p.status === 'preview' ? 'default' : 'secondary'} className="capitalize">{p.status}</Badge>
              </div>
              <CardDescription>{p.description || 'No description'}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-between items-center text-xs text-muted-foreground">
              <span>Updated {new Date(p.updated_at).toLocaleDateString()}</span>
              <Button size="sm" variant="ghost" onClick={() => remove(p.id)} aria-label="Delete project">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
        {!projects.length && <p className="text-sm text-muted-foreground col-span-full">No projects yet — create your first one above.</p>}
      </div>
    </div>
  );
}
