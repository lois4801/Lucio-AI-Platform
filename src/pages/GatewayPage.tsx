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
  const [metrics, setMetrics] = useState<any>(null);
  const [sso, setSso] = useState<any>(null);
  const [bundleText, setBundleText] = useState('');
  const [portMsg, setPortMsg] = useState('');

  const load = () => api('/gateway/status').then(setStatus).catch(() => {});
  const loadEnterprise = () => {
    api('/admin/metrics').then((r) => setMetrics(r.metrics)).catch(() => {});
    api('/auth/sso').then((r) => setSso(r.sso)).catch(() => {});
  };
  useEffect(() => { load(); loadEnterprise(); }, []);

  const toggle = async (p: Provider) => {
    setError('');
    try {
      await api(`/gateway/providers/${p.id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled: !p.enabled }) });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const canToggle = ['owner', 'admin'].includes(user.role);

  const validatePaste = async () => {
    setPortMsg('');
    try {
      const bundle = JSON.parse(bundleText);
      const r = await api('/admin/validate-bundle', { method: 'POST', body: JSON.stringify({ bundle }) });
      setPortMsg(r.valid ? `Bundle is valid (${r.checks.length} checks passed).` : `Bundle INVALID: ${r.checks.filter((c: any) => !c.pass).map((c: any) => c.name).join('; ')}`);
    } catch (err: any) { setPortMsg(err.message); }
  };
  const importPaste = async () => {
    setPortMsg('');
    try {
      const bundle = JSON.parse(bundleText);
      const r = await api('/admin/import-bundle', { method: 'POST', body: JSON.stringify({ bundle }) });
      setPortMsg(`Imported ${r.totalRows} rows into this org (${r.rekeyed} ids re-keyed).`);
    } catch (err: any) { setPortMsg(err.message); }
  };
  const toggleSso = async () => {
    setPortMsg('');
    try {
      await api('/admin/settings', { method: 'POST', body: JSON.stringify({ key: 'sso_enabled', value: sso?.orgEnabled ? 'false' : 'true' }) });
      loadEnterprise();
    } catch (err: any) { setPortMsg(err.message); }
  };

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Enterprise & Portability</CardTitle>
            <CardDescription>Own your data: export everything, validate a bundle, restore it into this org. Import re-keys colliding rows and re-scopes them to this org — it never overwrites.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.open('/api/admin/export-bundle', '_blank')}>Export bundle</Button>
              <Button size="sm" variant="outline" onClick={validatePaste} disabled={!bundleText.trim()}>Validate</Button>
              <Button size="sm" onClick={importPaste} disabled={!bundleText.trim()}>Import</Button>
            </div>
            <textarea
              className="w-full h-28 rounded-md border bg-background p-2 text-xs font-mono"
              placeholder="Paste a Lucio export bundle (JSON) to validate or import it…"
              value={bundleText}
              onChange={(e) => setBundleText(e.target.value)}
            />
            {portMsg && <p className="text-sm text-muted-foreground">{portMsg}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>SSO & metrics</CardTitle>
            <CardDescription>Reverse-proxy trusted-header SSO (honest status — it says exactly how to enable it) plus live counters.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {sso && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={sso.enabled ? 'default' : 'secondary'}>{sso.enabled ? 'SSO enabled' : 'SSO off'}</Badge>
                  <span className="text-xs text-muted-foreground">{sso.mode}</span>
                  {canToggle && (
                    <Button size="sm" variant="outline" onClick={toggleSso}>{sso.orgEnabled ? 'Disable org SSO' : 'Enable org SSO'}</Button>
                  )}
                </div>
                {sso.steps?.length > 0 && (
                  <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
                    {sso.steps.map((s: string) => <li key={s}>{s}</li>)}
                  </ol>
                )}
              </div>
            )}
            {metrics && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Uptime {metrics.uptime_sec}s · requests {metrics.requests?.total} (ok {metrics.requests?.ok}, 4xx {metrics.requests?.clientErr}, 5xx {metrics.requests?.serverErr}) · db {(metrics.db_bytes / 1024).toFixed(1)} KB</div>
                <div>Tables: {Object.entries(metrics.tables || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>
                <div>Top routes: {Object.entries(metrics.requests?.byRoute || {}).slice(0, 5).map(([k, v]) => `${k} (${v})`).join(' · ')}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
