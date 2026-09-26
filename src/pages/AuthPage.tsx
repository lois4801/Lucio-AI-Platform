import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

export default function AuthPage({ onAuth }: { onAuth: (user: any) => void }) {
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
      const { user } = await api(path, { method: 'POST', body: JSON.stringify(body) });
      onAuth(user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="text-4xl font-extrabold tracking-tight">Lucio<span className="text-primary">.</span></div>
          <p className="text-muted-foreground">Sovereign AI Platform — own the stack, own the data, own the runtime.</p>
          <div className="flex justify-center gap-2">
            <Badge variant="secondary">Self-hosted</Badge>
            <Badge variant="secondary">No credits required</Badge>
            <Badge variant="secondary">Local-first AI</Badge>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{mode === 'register' ? 'Create your organization' : 'Welcome back'}</CardTitle>
            <CardDescription>
              {mode === 'register' ? 'The first account becomes the organization owner.' : 'Sign in to your control plane.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="register">Register</TabsTrigger>
                <TabsTrigger value="login">Login</TabsTrigger>
              </TabsList>
              <form onSubmit={submit} className="space-y-3">
                {mode === 'register' && (
                  <>
                    <Input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                    <Input placeholder="Organization name" value={form.orgName} onChange={(e) => setForm({ ...form, orgName: e.target.value })} />
                  </>
                )}
                <Input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                <Input type="password" placeholder="Password (min 8 characters)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Working…' : mode === 'register' ? 'Create organization' : 'Sign in'}
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground">Core workflows run on the on-device Sovereign Engine — no paid AI API needed.</p>
      </div>
    </div>
  );
}
