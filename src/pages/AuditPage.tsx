import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Event = { id: string; action: string; entity_type: string; entity_id: string | null; actor_name: string | null; detail: any; created_at: string };

export default function AuditPage() {
  const [events, setEvents] = useState<Event[]>([]);
  useEffect(() => { api<{ events: Event[] }>('/audit').then((d) => setEvents(d.events)).catch(() => {}); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">Every sensitive action is recorded — who did what, when.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Events</CardTitle><CardDescription>Most recent 200 events.</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {events.map((e) => (
              <li key={e.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-muted-foreground"> on {e.entity_type}{e.entity_id ? ` ${e.entity_id.slice(0, 8)}` : ''}</span>
                  <div className="text-xs text-muted-foreground">by {e.actor_name || 'system'} · {new Date(e.created_at).toLocaleString()}</div>
                </div>
                {Object.keys(e.detail || {}).length > 0 && (
                  <Badge variant="outline" className="font-mono text-xs max-w-64 truncate">{JSON.stringify(e.detail)}</Badge>
                )}
              </li>
            ))}
            {!events.length && <p className="text-sm text-muted-foreground">No events yet.</p>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
