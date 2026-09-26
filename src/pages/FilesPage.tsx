import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, Download, Trash2 } from 'lucide-react';

type FileRow = { id: string; name: string; mime: string; size: number; created_at: string };

export default function FilesPage() {
  const [files, setFiles] = useState<FileRow[]>([]);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => api<{ files: FileRow[] }>('/files').then((d) => setFiles(d.files)).catch(() => {});
  useEffect(() => { load(); }, []);

  const upload = async (f: globalThis.File) => {
    setError('');
    const buf = await f.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    try {
      await api('/files', { method: 'POST', body: JSON.stringify({ name: f.name, mime: f.type || 'application/octet-stream', dataBase64: btoa(binary) }) });
      load();
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Files & Assets</h1>
        <p className="text-muted-foreground">Your media lives in your own storage — not a third-party bucket.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Upload</CardTitle><CardDescription>Max 25 MB per file.</CardDescription></CardHeader>
        <CardContent>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
          <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4 mr-1" /> Choose file</Button>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Stored files</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {files.map((f) => (
              <li key={f.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB · {f.mime}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{new Date(f.created_at).toLocaleDateString()}</Badge>
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`/api/files/${f.id}/download`} download><Download className="h-3.5 w-3.5" /></a>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await api(`/files/${f.id}`, { method: 'DELETE' }); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
            {!files.length && <p className="text-sm text-muted-foreground">No files yet.</p>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
