import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Provider = { id: string; kind: string; label: string; base_url: string; enabled: number; is_local: number };

export default function GatewayPage() {
  const { user } = useOutletContext<{ user: User }>();
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');

  const load = () => api('/gateway/status').then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  const toggle = async (p: Provider) => {
    setError('');
    try {
      await api(`/gateway/providers/${p.id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled: !p.enabled }) });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const canToggle = ['owner', 'admin'].includes(user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Model Gateway</h1>
        <p className="text-muted-foreground">Benchmark-aware routing with a sovereign local default. External providers are opt-in only.</p>
      </div>
      {status && (
        <Card>
          <CardHeader><CardTitle>Active runtime</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-3 text-sm">
            <Badge className="bg-green-600">{status.sovereign ? 'Sovereign' : 'External'}</Badge>
            <span className="font-medium">{status.activeLabel}</span>
            <span className="text-muted-foreground">· external providers enabled: {status.externalEnabled}</span>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>Provider registry</CardTitle>
          <CardDescription>Local providers power the default path. External adapters stay disabled unless an administrator enables them.</CardDescription></CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(status?.providers || []).map((p: Provider) => (
              <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">{p.base_url || 'on-device'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={p.is_local ? 'secondary' : 'outline'}>{p.is_local ? 'local' : 'external'}</Badge>
                  <Badge variant={p.enabled ? 'default' : 'secondary'}>{p.enabled ? 'enabled' : 'disabled'}</Badge>
                  {canToggle ? (
                    <Button size="sm" variant="outline" onClick={() => toggle(p)}>
                      {p.enabled ? 'Disable' : 'Enable'}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">admin only</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          {!canToggle && <p className="text-xs text-muted-foreground mt-3">Your role ({user.role}) cannot change provider settings.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
