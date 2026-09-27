import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Suite = { id: string; task_family: string; name: string; pass_threshold: number; fixtures: any; validator_names: string[] };
type Run = { id: string; route: string; seed: number; total_score: number; passed: number; failure_class: string | null; scores: { name: string; weight: number; pass: boolean }[]; created_at: string };
type Claim = { id: string; text: string; run_id: string; created_at: string };
type Champ = { task_family: string; champion_route: string; challenger_route: string | null; best_score: number };
type Perf = { task_family: string; route: string; runs: number; successes: number; avg_score: number; promoted: number };

export default function BenchmarksPage() {
  const { user } = useOutletContext<{ user: User }>();
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [champs, setChamps] = useState<Champ[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
  const [policyTier, setPolicyTier] = useState('3');
  const [meta, setMeta] = useState<any>(null);
  const [family, setFamily] = useState('website-build');
  const [route, setRoute] = useState('champion');
  const [seed, setSeed] = useState(42);
  const [claimText, setClaimText] = useState('');
  const [evidenceRun, setEvidenceRun] = useState('');
  const [msg, setMsg] = useState('');
  const isAdmin = ['owner', 'admin'].includes(user.role);

  const load = () => {
    api('/benchmarks/suites').then((r) => { setSuites(r.suites); if (r.suites[0]) setFamily((f) => r.suites.some((s: Suite) => s.task_family === f) ? f : r.suites[0].task_family); });
    api('/benchmarks/runs').then((r) => setRuns(r.runs));
    api('/benchmarks/claims').then((r) => setClaims(r.claims));
    api('/benchmarks/championships').then((r) => setChamps(r.championships));
    api('/optimize/performance').then((r) => setPerf(r.performance));
    api('/admin/settings').then((r) => { if (r.settings?.policy_max_tier) setPolicyTier(r.settings.policy_max_tier.value); }).catch(() => {});
    api('/benchmarks/meta').then(setMeta);
  };
  useEffect(load, []);

  const runBench = async () => {
    setMsg('');
    try { await api('/benchmarks/run', { method: 'POST', body: JSON.stringify({ taskFamily: family, route, seed }) }); load(); }
    catch (err: any) { setMsg(err.message); }
  };
  const addClaim = async () => {
    setMsg('');
    try { await api('/benchmarks/claims', { method: 'POST', body: JSON.stringify({ text: claimText, runId: evidenceRun }) }); setClaimText(''); setEvidenceRun(''); load(); }
    catch (err: any) { setMsg(err.message); }
  };
  const setChamp = async (taskFamily: string, championRoute: string, challengerRoute: string) => {
    setMsg('');
    try { await api('/benchmarks/championships', { method: 'POST', body: JSON.stringify({ taskFamily, championRoute, challengerRoute }) }); load(); }
    catch (err: any) { setMsg(err.message); }
  };
  const promote = async () => {
    setMsg('');
    try { const r = await api('/optimize/promote', { method: 'POST', body: JSON.stringify({ taskFamily: family }) }); setMsg(`Promoted: ${r.promotion.reason}`); load(); }
    catch (err: any) { setMsg(err.message); }
  };
  const rollback = async () => {
    setMsg('');
    try { const r = await api('/optimize/rollback', { method: 'POST', body: JSON.stringify({ taskFamily: family }) }); setMsg(`Rolled back: ${r.rollback.restored} restored as champion`); load(); }
    catch (err: any) { setMsg(err.message); }
  };
  const savePolicy = async () => {
    setMsg('');
    try { await api('/admin/settings', { method: 'POST', body: JSON.stringify({ key: 'policy_max_tier', value: policyTier }) }); setMsg(`Policy updated: auto-promotion capped at tier ${policyTier}.`); }
    catch (err: any) { setMsg(err.message); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Benchmarks</h1>
        <p className="text-muted-foreground">Deterministic, seeded evaluation for the core task families. Claims require a stored passing run — unverified superiority is rejected.</p>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {suites.map((s) => (
          <Card key={s.id} className={family === s.task_family ? 'border-primary' : ''} onClick={() => setFamily(s.task_family)}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{s.name}</CardTitle>
              <CardDescription className="font-mono text-xs">{s.task_family} · pass ≥ {s.pass_threshold}</CardDescription></CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              {s.validator_names.map((v) => <div key={v}>· {v}</div>)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Run benchmark</CardTitle>
          <CardDescription>Same seed + route always produces the identical artifact and scores — that reproducibility is the point.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <label className="text-xs space-y-1">
            <div className="text-muted-foreground">Suite</div>
            <select className="rounded-md border bg-background p-2 text-sm" value={family} onChange={(e) => setFamily(e.target.value)}>
              {suites.map((s) => <option key={s.task_family} value={s.task_family}>{s.task_family}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <div className="text-muted-foreground">Route</div>
            <select className="rounded-md border bg-background p-2 text-sm" value={route} onChange={(e) => setRoute(e.target.value)}>
              {(meta?.routes || []).map((r: any) => <option key={r.id} value={r.id}>{r.id} — {r.label}</option>)}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <div className="text-muted-foreground">Seed</div>
            <Input type="number" className="w-28" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
          </label>
          <Button onClick={runBench}>Run</Button>
          {isAdmin && (
            <Button variant="outline" onClick={() => setChamp(family, route, route === 'champion' ? 'challenger' : 'champion')}>
              Crown {route} champion for {family}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Runs</CardTitle>
            <CardDescription>Failure classes: {(meta?.failureClasses || []).join(' · ')}</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
            {runs.slice(0, 12).map((r) => (
              <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={r.passed ? 'default' : 'destructive'}>{r.passed ? `PASS ${r.total_score}` : `FAIL ${r.total_score}`}</Badge>
                  <span className="font-mono text-xs">{r.route} · seed {r.seed}</span>
                  {r.failure_class && <Badge variant="secondary">{r.failure_class}</Badge>}
                  <span className="text-xs text-muted-foreground ml-auto">{r.created_at}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.scores.map((c) => <span key={c.name} className={c.pass ? '' : 'text-destructive'}>{c.pass ? '✓' : '✗'} {c.name} · </span>)}
                </div>
                {isAdmin && r.passed === 1 && (
                  <Button size="sm" variant="outline" onClick={() => setEvidenceRun(r.id)}>Use as claim evidence</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Championships</CardTitle>
              <CardDescription>Champion / challenger routing per task family, decided by an admin from benchmark evidence.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {champs.length === 0 && <p className="text-muted-foreground">No champions crowned yet.</p>}
              {champs.map((c) => (
                <div key={c.task_family} className="flex items-center gap-2">
                  <span className="font-mono text-xs w-36">{c.task_family}</span>
                  <Badge>champion: {c.champion_route}</Badge>
                  {c.challenger_route && <Badge variant="secondary">challenger: {c.challenger_route}</Badge>}
                  <span className="text-xs text-muted-foreground">best {c.best_score}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Adaptive optimization</CardTitle>
              <CardDescription>The platform reroutes itself only on measured, deterministic evidence — enough clean runs, a strictly better average, and never above the human policy cap. Every promotion can be rolled back.</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {perf.length > 0 && (
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-muted-foreground">
                    <th className="py-1">family</th><th>route</th><th>runs</th><th>clean</th><th>avg</th><th></th>
                  </tr></thead>
                  <tbody>
                    {perf.filter((p) => p.task_family === family).map((p) => (
                      <tr key={p.route} className="border-t">
                        <td className="py-1 font-mono">{p.task_family}</td>
                        <td className="font-mono">{p.route}</td>
                        <td>{p.runs}</td>
                        <td>{p.successes}/{p.runs}</td>
                        <td>{p.avg_score}</td>
                        <td>{p.promoted === 1 && <Badge>champion</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {isAdmin && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs space-y-1">
                    <div className="text-muted-foreground">policy_max_tier (human cap on auto-promotion)</div>
                    <select className="rounded-md border bg-background p-2 text-sm" value={policyTier} onChange={(e) => setPolicyTier(e.target.value)}>
                      <option value="1">1 — baseline only</option>
                      <option value="2">2 — challenger allowed</option>
                      <option value="3">3 — full auto-promotion</option>
                    </select>
                  </label>
                  <Button size="sm" variant="outline" onClick={savePolicy}>Save policy</Button>
                  <Button size="sm" onClick={promote}>Promote challenger ({family})</Button>
                  <Button size="sm" variant="outline" onClick={rollback}>Roll back ({family})</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Claims</CardTitle>
              <CardDescription>Every claim must cite a passing run in this org — the gate rejects everything else with the reason.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {isAdmin && (
                <div className="space-y-2">
                  <Input placeholder="Claim text, e.g. Champion route beats baseline on website-build" value={claimText} onChange={(e) => setClaimText(e.target.value)} />
                  <div className="flex gap-2">
                    <Input placeholder="evidence run id" value={evidenceRun} onChange={(e) => setEvidenceRun(e.target.value)} />
                    <Button size="sm" onClick={addClaim} disabled={!claimText.trim() || !evidenceRun.trim()}>Record claim</Button>
                  </div>
                </div>
              )}
              {claims.map((c) => (
                <div key={c.id} className="text-sm rounded-md border p-2">
                  <div>{c.text}</div>
                  <div className="text-xs text-muted-foreground font-mono">evidence: {c.run_id.slice(0, 8)}… · {c.created_at}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
