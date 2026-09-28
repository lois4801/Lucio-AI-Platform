import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, KeyRound, Loader2, MessageSquareText, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';

type CatalogEntry = { provider: string; label: string; api: string; baseUrl: string; models: string[]; envVar: string; configured: boolean };
type ModelEntry = { id: string; label: string; source: string };
type KeyRow = {
  provider: string; label: string; model: string; enabled: boolean;
  status: string; statusDetail: string; lastVerifiedAt: string | null; maskedKey?: string;
  availableModels?: ModelEntry[];
};
type ProvidersResponse = { keys: KeyRow[]; catalog: CatalogEntry[] };
type CouncilAnswer = { provider: string; label: string; model: string; ok: boolean; text: string; latencyMs: number; error?: string };
type KeyDrafts = Record<string, { key: string; model: string }>;
type StageResult = { ok: boolean; detail: string };
type VerifyDiagnostics = {
  provider: string; checkedModel: string; status: string; detail: string; latencyMs: number; verifiedAt: string;
  discoveredCount?: number;
  authentication?: StageResult; modelDiscovery?: StageResult; selectedModel?: StageResult; inference?: StageResult;
};
type DiscoveryResult = { provider: string; source: string; degraded: boolean; error?: string; models: ModelEntry[] };

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ok: 'default', unverified: 'secondary', invalid: 'destructive', error: 'destructive', missing: 'outline',
  healthy: 'default', authentication_failed: 'destructive', model_unavailable: 'destructive',
  provider_unavailable: 'secondary', quota_billing_error: 'destructive', rate_limited: 'secondary',
};
const STATUS_LABEL: Record<string, string> = {
  healthy: 'HEALTHY', authentication_failed: 'AUTHENTICATION FAILED', model_unavailable: 'MODEL UNAVAILABLE',
  provider_unavailable: 'PROVIDER UNAVAILABLE', quota_billing_error: 'QUOTA / BILLING ERROR', rate_limited: 'RATE LIMITED',
};

export default function AiProvidersPage() {
  const [data, setData] = useState<ProvidersResponse | null>(null);
  const [drafts, setDrafts] = useState<KeyDrafts>({});
  const [saving, setSaving] = useState('');
  const [verifying, setVerifying] = useState('');
  const [refreshing, setRefreshing] = useState('');
  const [verifyDiag, setVerifyDiag] = useState<Record<string, VerifyDiagnostics>>({});
  const [discovery, setDiscovery] = useState<Record<string, DiscoveryResult>>({});
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [councilBusy, setCouncilBusy] = useState(false);
  const [answers, setAnswers] = useState<CouncilAnswer[] | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatReply, setChatReply] = useState<{ text: string; provider: string; label: string; sovereign: boolean } | null>(null);

  const load = () => api<ProvidersResponse>('/ai/providers').then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading AI providers…</div>;

  const keyOf = (p: string) => data.keys.find((k) => k.provider === p);

  const saveKey = async (provider: string) => {
    const d = drafts[provider];
    if (!d?.key?.trim()) { setError('paste an API key first'); return; }
    setError(''); setSaving(provider);
    try {
      await api(`/ai/providers/keys`, { method: 'PUT', body: JSON.stringify({ provider, apiKey: d.key.trim(), model: d.model || undefined }) });
      setDrafts((s) => ({ ...s, [provider]: { key: '', model: d.model || '' } }));
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(''); }
  };

  const verify = async (provider: string) => {
    setError(''); setVerifying(provider);
    try {
      const r = await api<{ diagnostics?: VerifyDiagnostics }>(`/ai/providers/${provider}/verify`, { method: 'POST', body: '{}' });
      if (r.diagnostics) setVerifyDiag((s) => ({ ...s, [provider]: r.diagnostics! }));
      await load();
    }
    catch (e: any) { setError(e.message); } finally { setVerifying(''); }
  };

  const refreshModels = async (provider: string) => {
    setError(''); setRefreshing(provider);
    try {
      const r = await api<DiscoveryResult>(`/ai/providers/${provider}/discover`, { method: 'POST', body: '{}' });
      setDiscovery((s) => ({ ...s, [provider]: r }));
      await load();
    } catch (e: any) { setError(e.message); } finally { setRefreshing(''); }
  };

  const toggle = async (k: KeyRow) => {
    setError('');
    try { await api(`/ai/providers/${k.provider}/toggle`, { method: 'POST', body: JSON.stringify({ enabled: !k.enabled }) }); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const removeKey = async (provider: string) => {
    setError('');
    try { await api(`/ai/providers/keys/${provider}`, { method: 'DELETE' }); setAnswers(null); await load(); }
    catch (e: any) { setError(e.message); }
  };

  const runCouncil = async () => {
    if (!prompt.trim()) return;
    setError(''); setCouncilBusy(true); setAnswers(null); setChatReply(null);
    try {
      const out = await api<{ answers: CouncilAnswer[] }>('/ai/council', { method: 'POST', body: JSON.stringify({ prompt }) });
      setAnswers(out.answers);
    } catch (e: any) { setError(e.message); } finally { setCouncilBusy(false); }
  };

  const runChat = async () => {
    if (!prompt.trim()) return;
    setError(''); setChatBusy(true);
    try {
      const out = await api<{ text: string; provider: string; label: string; sovereign: boolean }>('/ai/chat', {
        method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      });
      setChatReply(out);
    } catch (e: any) { setError(e.message); } finally { setChatBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Providers</h1>
        <p className="text-muted-foreground">
          Connect Kimi, Claude, ChatGPT and more — all at once. Keys are AES-256 encrypted at rest,
          verified live, and injected into build runs only for the duration of a call.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {data.catalog.map((c) => {
          const k = keyOf(c.provider);
          const d = drafts[c.provider] || { key: '', model: '' };
          return (
            <Card key={c.provider}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" /> {c.label}</CardTitle>
                  {k && (
                    <div className="flex items-center gap-1.5">
                      <Badge variant={STATUS_BADGE[k.status] || 'secondary'} className="capitalize">{k.status}</Badge>
                      <Button size="sm" variant={k.enabled ? 'default' : 'outline'} className="h-6 text-[11px] px-2" onClick={() => toggle(k)}>
                        {k.enabled ? 'On' : 'Off'}
                      </Button>
                    </div>
                  )}
                </div>
                <CardDescription>{c.baseUrl} · {c.api} API</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {k && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <ShieldCheck className="h-3.5 w-3.5" /> {k.maskedKey} · model <span className="font-mono">{k.model}</span>
                    {k.statusDetail && <span className="w-full text-destructive/80">{k.statusDetail}</span>}
                  </p>
                )}
                <Input
                  type="password"
                  placeholder={k ? 'Replace key…' : `Paste your ${c.label} API key`}
                  value={d.key}
                  onChange={(e) => setDrafts((s) => ({ ...s, [c.provider]: { ...d, key: e.target.value } }))}
                />
                <div className="flex gap-2">
                  <select
                    className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
                    value={d.model || k?.model || c.models[0]}
                    onChange={(e) => setDrafts((s) => ({ ...s, [c.provider]: { ...d, model: e.target.value } }))}
                  >
                    {(k?.availableModels?.length ? k.availableModels : c.models.map((m) => ({ id: m, label: m, source: 'manifest' }))).map((m) => (
                      <option key={m.id} value={m.id}>{m.label}{m.source === 'manifest' ? ' (catalog)' : ''}</option>
                    ))}
                  </select>
                  <Button size="sm" disabled={saving === c.provider || !d.key.trim()} onClick={() => saveKey(c.provider)}>
                    {saving === c.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                    {k ? 'Update' : 'Save'}
                  </Button>
                  {k && (
                    <>
                      <Button size="sm" variant="secondary" disabled={verifying === c.provider} onClick={() => verify(c.provider)}>
                        {verifying === c.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                      </Button>
                      <Button size="sm" variant="outline" disabled={refreshing === c.provider} onClick={() => refreshModels(c.provider)} title="Fetch the live model catalog from this provider">
                        {refreshing === c.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh models'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeKey(c.provider)} aria-label={`Delete ${c.label} key`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
                {k?.availableModels && (
                  <p className="text-[11px] text-muted-foreground">
                    {k.availableModels.filter((m) => m.source === 'discovered').length} discovered live
                    · {k.availableModels.filter((m) => m.source === 'manifest').length} from catalog
                  </p>
                )}
                {discovery[c.provider] && (
                  <p className={`text-[11px] ${discovery[c.provider].degraded ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {discovery[c.provider].degraded
                      ? `Live discovery unavailable${discovery[c.provider].error ? ` (${discovery[c.provider].error})` : ''} — showing catalog models`
                      : `Live catalog fetched: ${discovery[c.provider].models.length} models`}
                  </p>
                )}
                {verifyDiag[c.provider] && <DiagnosticsPanel d={verifyDiag[c.provider]} />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Multi-AI council</CardTitle>
          <CardDescription>
            Every connected AI answers the same prompt at once — compare, then use the best answer for your build.
            Also powers the assistant chat and the Claw Coder's build runs (fallback chain, verified providers first).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="w-full min-h-[90px] rounded-md border bg-background px-3 py-2 text-sm"
            placeholder='e.g. "Write the hero section copy for a luxury wedding photography studio in Kingston — cinematic, quiet luxury tone"'
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex gap-2">
            <Button disabled={councilBusy || !prompt.trim()} onClick={runCouncil}>
              {councilBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              Ask all AIs at once
            </Button>
            <Button variant="secondary" disabled={chatBusy || !prompt.trim()} onClick={runChat}>
              {chatBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4 mr-1" />}
              Chat (best available)
            </Button>
          </div>

          {chatReply && (
            <div className="rounded-md border bg-muted/40 p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground">
                {chatReply.sovereign ? 'Sovereign engine (no external keys in use)' : `${chatReply.label} · ${chatReply.provider}`}
              </p>
              <p className="text-sm whitespace-pre-wrap">{chatReply.text}</p>
            </div>
          )}

          {answers && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {answers.map((a) => (
                <div key={a.provider} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.label}</p>
                    {a.ok
                      ? <Badge variant="outline" className="text-[10px]">{a.latencyMs} ms</Badge>
                      : <Badge variant="destructive" className="text-[10px]">failed</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">{a.model}</p>
                  {a.ok
                    ? <p className="text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">{a.text}</p>
                    : <p className="text-xs text-destructive">{a.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DiagnosticsPanel({ d }: { d: VerifyDiagnostics }) {
  const rows: { name: string; s?: StageResult }[] = [
    { name: 'Authentication', s: d.authentication },
    { name: 'Model discovery', s: d.modelDiscovery },
    { name: 'Selected model', s: d.selectedModel },
    { name: 'Inference probe', s: d.inference },
  ];
  return (
    <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <Badge variant={STATUS_BADGE[d.status] || 'secondary'} className="text-[10px]">{STATUS_LABEL[d.status] || d.status}</Badge>
        <span className="text-muted-foreground">{d.latencyMs} ms{d.discoveredCount != null ? ` · ${d.discoveredCount} models discovered` : ''}</span>
      </div>
      {rows.filter((r) => r.s).map((r) => (
        <div key={r.name} className="flex items-start gap-2">
          {r.s!.ok
            ? <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
            : <span className="text-destructive font-bold shrink-0">✕</span>}
          <div>
            <p className="font-medium">{r.name}</p>
            {r.s!.detail && <p className="text-muted-foreground break-all">{r.s!.detail}</p>}
          </div>
        </div>
      ))}
      {d.detail && <p className="text-muted-foreground break-all">{d.detail}</p>}
      <p className="text-[10px] text-muted-foreground">checked {d.checkedModel} · {new Date(d.verifiedAt).toLocaleString()}</p>
    </div>
  );
}
