import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Run = { id: string; query: string; mode: string; answer: string; evidence: string; created_at: string };
type Evidence = { claim: string; sourceUrl: string; sourceTitle: string; provenance: string; confidence: number };

export default function ResearchPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('ask');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceClaim, setSourceClaim] = useState('');
  const [error, setError] = useState('');

  const load = () => api<{ runs: Run[] }>('/research').then((d) => setRuns(d.runs)).catch(() => {});
  useEffect(() => { load(); }, []);

  const run = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    const sources = sourceUrl ? [{ url: sourceUrl, claim: sourceClaim || query }] : [];
    try {
      await api('/research/run', { method: 'POST', body: JSON.stringify({ query, mode, sources }) });
      setQuery(''); setSourceUrl(''); setSourceClaim('');
      load();
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Research Gateway</h1>
        <p className="text-muted-foreground">Evidence-grounded answers with provenance — every claim tracks its source.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>New research run</CardTitle>
          <CardDescription>Optional: attach a source URL so the answer is grounded in evidence with provenance.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={run} className="space-y-3">
            <div className="flex gap-2">
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ask">Ask the Web</SelectItem>
                  <SelectItem value="market-scan">Market Scan</SelectItem>
                  <SelectItem value="website-gap">Website Gap Scan</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Research question…" value={query} onChange={(e) => setQuery(e.target.value)} required className="flex-1" />
            </div>
            <div className="flex gap-2">
              <Input placeholder="Evidence source URL (optional)" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="flex-1" />
              <Input placeholder="Claim this source supports (optional)" value={sourceClaim} onChange={(e) => setSourceClaim(e.target.value)} className="flex-1" />
            </div>
            <Button type="submit">Run research</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
      {runs.map((r) => {
        let ev: Evidence[] = [];
        try { ev = JSON.parse(r.evidence); } catch { /* evidence payload not JSON */ }
        return (
          <Card key={r.id}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-base">{r.query}</CardTitle>
                <Badge variant="secondary" className="capitalize">{r.mode.replace('-', ' ')}</Badge>
              </div>
              <CardDescription>{new Date(r.created_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{r.answer}</p>
              {ev.length > 0 && (
                <div className="border rounded-lg p-3 space-y-1 bg-muted/40">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Evidence & provenance</div>
                  {ev.map((e, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{e.sourceTitle}</span>
                      {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline ml-1">{e.sourceUrl}</a>}
                      <span className="text-muted-foreground ml-1">(provenance: {e.provenance}, confidence {e.confidence})</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
      {!runs.length && <p className="text-sm text-muted-foreground">No research runs yet.</p>}
    </div>
  );
}
