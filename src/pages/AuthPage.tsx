import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, type User } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScanSearch, Hammer, BriefcaseBusiness, ShieldCheck } from 'lucide-react';

export default function AuthPage({ onAuth }: { onAuth: (user: User) => void }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [form, setForm] = useState({ email: '', name: '', password: '', orgName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login';
      const body = mode === 'register' ? form : { email: form.email, password: form.password };
      const { user } = await api<{ user: User }>(path, { method: 'POST', body: JSON.stringify(body) });
      onAuth(user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Brand panel — pitch on desktop, compact header on mobile */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-zinc-950 p-6 sm:p-10 text-zinc-50">
        <div className="pointer-events-none absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(60% 50% at 20% 10%, rgba(120,119,198,0.35), transparent), radial-gradient(50% 40% at 90% 90%, rgba(251,191,36,0.18), transparent)' }} />
        <div className="relative">
          <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">Lucio<span className="text-amber-400">.</span></div>
          <p className="mt-1 text-sm text-zinc-400">Sovereign AI Platform</p>
        </div>
        <div className="relative mt-8 hidden lg:block">
          <h1 className="text-3xl xl:text-4xl font-bold leading-tight tracking-tight">
            Find businesses with no website. Build them one in minutes. Bill monthly.
          </h1>
          <p className="mt-4 max-w-md text-zinc-400">
            A self-hosted agency-in-a-box: map-first market scanner, deterministic AI site builder,
            and a complete client-selling layer — your data never leaves the machine.
          </p>
          <div className="mt-8 space-y-3 text-sm">
            {[
              { icon: ScanSearch, text: 'Live map scanner with evidence-first verification' },
              { icon: Hammer, text: '12 deterministic design universes — no two sites alike' },
              { icon: BriefcaseBusiness, text: 'Owner portal, deals pipeline and monthly billing' },
              { icon: ShieldCheck, text: 'Sovereign engine — core workflows need no paid AI API' },
            ].map((f) => (
              <div key={f.text} className="flex items-center gap-3 text-zinc-300">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <f.icon className="h-4 w-4" />
                </div>
                {f.text}
              </div>
            ))}
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2 lg:mt-0">
          <Badge variant="secondary" className="bg-white/10 text-zinc-200 hover:bg-white/10">Self-hosted</Badge>
          <Badge variant="secondary" className="bg-white/10 text-zinc-200 hover:bg-white/10">No credits required</Badge>
          <Badge variant="secondary" className="bg-white/10 text-zinc-200 hover:bg-white/10">Local-first AI</Badge>
        </div>
      </div>

      {/* Auth card */}
      <div className="flex items-center justify-center p-4 sm:p-8"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle>{mode === 'register' ? 'Create your organization' : 'Welcome back'}</CardTitle>
            <CardDescription>
              {mode === 'register' ? 'The first account becomes the organization owner.' : 'Sign in to your control plane.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as 'login' | 'register')}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="register" className="min-h-10">Register</TabsTrigger>
                <TabsTrigger value="login" className="min-h-10">Login</TabsTrigger>
              </TabsList>
              <form onSubmit={submit} className="space-y-3">
                {mode === 'register' && (
                  <>
                    <Input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
                    <Input placeholder="Organization name" value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} autoComplete="organization" />
                  </>
                )}
                <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="email" />
                <Input type="password" placeholder="Password (min 8 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full min-h-11" disabled={busy}>
                  {busy ? 'Working…' : mode === 'register' ? 'Create organization' : 'Sign in'}
                </Button>
              </form>
            </Tabs>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Core workflows run on the on-device Sovereign Engine — no paid AI API needed.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
