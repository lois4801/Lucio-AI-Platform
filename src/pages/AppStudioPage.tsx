import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AppWindow, Plus, Save } from 'lucide-react';

type Field = { key: string; label: string; type: string; required?: boolean; options?: string[] };
type AppDef = { id: string; slug: string; name: string; description: string; system: boolean; schema: { fields: Field[]; workflows?: any[] } };
type Record_ = { id: string; status: string; data: Record<string, any>; created_at: string; updated_at: string | null };

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  open: 'outline', escalated: 'destructive', needs_review: 'secondary', blocked: 'destructive', license_expired: 'destructive',
};

export default function AppStudioPage() {
  const [apps, setApps] = useState<AppDef[]>([]);
  const [selected, setSelected] = useState<AppDef | null>(null);
  const [records, setRecords] = useState<Record_[]>([]);
  const [form, setForm] = useState<Record<string, any>>({});
  const [showNew, setShowNew] = useState(false);
  const [newApp, setNewApp] = useState({ name: '', slug: '', description: '', schemaJson: '{\n  "fields": [\n    { "key": "title", "label": "Title", "type": "text", "required": true }\n  ],\n  "workflows": []\n}' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = () => api<{ apps: AppDef[] }>('/apps/definitions').then((d) => setApps(d.apps)).catch(() => {});
  useEffect(() => { load(); }, []);

  const openApp = async (app: AppDef) => {
    setError(''); setSelected(app); setForm({});
    try { const d = await api<{ records: Record_[] }>(`/apps/definitions/${app.id}/records`); setRecords(d.records); }
    catch { setRecords([]); }
  };

  const run = async (fn: () => Promise<any>, okMsg: string) => {
    setError(''); setNotice('');
    try { await fn(); setNotice(okMsg); await load(); if (selected) await openApp(selected); }
    catch (e: any) { setError(e.message); }
  };

  const submitRecord = () => run(async () => {
    await api(`/apps/definitions/${selected?.id}/records`, { method: 'POST', body: JSON.stringify({ data: form }) });
    setForm({});
  }, 'Record saved — workflow rules applied');

  const createApp = () => run(async () => {
    let schema;
    try { schema = JSON.parse(newApp.schemaJson); }
    catch { throw new Error('schema JSON is invalid — fix it and try again'); }
    await api('/apps/definitions', { method: 'POST', body: JSON.stringify({ name: newApp.name, slug: newApp.slug, description: newApp.description, schema }) });
    setShowNew(false); setNewApp({ name: '', slug: '', description: '', schemaJson: newApp.schemaJson });
  }, 'App definition published');

  const fieldInput = (f: Field) => {
    const val = form[f.key] ?? '';
    if (f.type === 'select') {
      return (
        <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={val} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
          <option value="">—</option>
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === 'checkbox') {
      return <input type="checkbox" className="h-4 w-4" checked={val === true} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} />;
    }
    return <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={val} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">App Studio</h1>
          <p className="text-muted-foreground">Reusable app definitions — schema, forms and workflow rules over shared primitives. Lucio Safety and Lucio Contractor ship built in; define your own vertical apps from the same primitives.</p>
        </div>
        <Button onClick={() => setShowNew(true)}><Plus className="h-4 w-4 mr-1" /> New app</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>}

      <div className="grid md:grid-cols-3 gap-4">
        {apps.map((a) => (
          <Card key={a.id} className={`cursor-pointer hover:border-primary ${selected?.id === a.id ? 'border-primary' : ''}`} onClick={() => openApp(a)}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-lg flex items-center gap-2"><AppWindow className="h-5 w-5" /> {a.name}</CardTitle>
                {a.system && <Badge variant="secondary">built-in</Badge>}
              </div>
              <CardDescription className="line-clamp-2">{a.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{a.schema.fields.length} fields · {a.schema.workflows?.length || 0} workflow rules</CardContent>
          </Card>
        ))}
      </div>

      {selected && (
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <Card>
            <CardHeader><CardTitle>New {selected.name} record</CardTitle>
              <CardDescription>Generated from the app schema — required fields and workflow rules are enforced server-side.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {selected.schema.fields.map((f) => (
                <div key={f.key} className="flex items-center gap-3">
                  <label className="text-sm w-44 shrink-0">{f.label}{f.required && <span className="text-destructive"> *</span>}</label>
                  <div className="flex-1">{fieldInput(f)}</div>
                </div>
              ))}
              <Button className="w-full" onClick={submitRecord}><Save className="h-4 w-4 mr-1" /> Save record</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Records</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  {selected.schema.fields.slice(0, 3).map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                  <TableHead>Status</TableHead><TableHead>Updated</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      {selected.schema.fields.slice(0, 3).map((f) => <TableCell key={f.key} className="text-sm max-w-40"><span className="line-clamp-1">{String(r.data[f.key] ?? '—')}</span></TableCell>)}
                      <TableCell><Badge variant={STATUS_VARIANT[r.status] || 'outline'}>{r.status.replaceAll('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date((r.updated_at || r.created_at)).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                  {!records.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No records yet — save one on the left.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New app definition</DialogTitle>
            <DialogDescription>Schemas are data, never code: whitelisted field types (text, number, select, date, checkbox) and workflow actions (setStatus, setStatusIfExpired, requireField) only.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="App name" value={newApp.name} onChange={(e) => setNewApp({ ...newApp, name: e.target.value })} />
              <Input placeholder="slug-kebab-case" value={newApp.slug} onChange={(e) => setNewApp({ ...newApp, slug: e.target.value })} className="w-48" />
            </div>
            <Input placeholder="Description" value={newApp.description} onChange={(e) => setNewApp({ ...newApp, description: e.target.value })} />
            <textarea className="w-full h-56 rounded-md border bg-background px-3 py-2 font-mono text-xs" value={newApp.schemaJson} onChange={(e) => setNewApp({ ...newApp, schemaJson: e.target.value })} />
            <Button className="w-full" disabled={!newApp.name.trim() || !newApp.slug.trim()} onClick={createApp}>Publish app</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
