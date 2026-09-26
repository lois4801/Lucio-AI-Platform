import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Job = { id: string; type: string; status: string; output: any; error: string; created_at: string };

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  succeeded: 'default', failed: 'destructive', running: 'secondary', queued: 'secondary', cancelled: 'secondary',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => { api<{ jobs: Job[] }>('/jobs').then((d) => setJobs(d.jobs)).catch(() => {}); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sandbox Jobs</h1>
        <p className="text-muted-foreground">Isolated build and QA jobs, launched from the App Builder.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Job history</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {jobs.map((j) => (
              <li key={j.id} className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm">{j.type}</span>
                  <Badge variant={STATUS_VARIANT[j.status] || 'outline'} className="capitalize">{j.status}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{new Date(j.created_at).toLocaleString()}</div>
                {j.output && Object.keys(j.output).length > 0 && (
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto">{JSON.stringify(j.output, null, 2)}</pre>
                )}
                {j.error && <p className="text-xs text-destructive">{j.error}</p>}
              </li>
            ))}
            {!jobs.length && <p className="text-sm text-muted-foreground">No jobs yet — run a QA validation from the App Builder.</p>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
