import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Agent = {
  id: string; source_pack: string; name: string; description: string; division: string;
  tags: string[]; difficulty: string; color: string; emoji: string; license: string; enabled: boolean;
};
type Msg = { id: string; role: string; content: string; created_at: string };
type ThreadMsg = { role: 'user' | 'agent'; text: string; streaming?: boolean };

export default function AgentsPage() {
  const location = useLocation();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [divisions, setDivisions] = useState<{ division: string; n: number }[]>([]);
  const [q, setQ] = useState('');
  const [division, setDivision] = useState('');
  const [pack, setPack] = useState('');
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const esRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (division) params.set('division', division);
    if (pack) params.set('pack', pack);
    api(`/agents?${params}`).then((r) => { setAgents(r.agents); setDivisions(r.divisions); }).catch((e) => setMsg(e.message));
  };
  useEffect(() => { load(); }, [division, pack]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api('/nexus/projects').then((r) => setProjects(r.projects)).catch(() => setProjects([])); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);

  const toggle = async (a: Agent) => {
    try {
      await api(`/agents/${encodeURIComponent(a.id)}/enable`, { method: a.enabled ? 'DELETE' : 'POST' });
      load();
      if (chatAgent?.id === a.id && a.enabled) setChatAgent(null);
    } catch (e: any) { setMsg(e.message); }
  };

  const openChat = async (a: Agent) => {
    setChatAgent(a);
    setThread([]);
    setMsg('');
    try {
      const r = await api(`/agents/${encodeURIComponent(a.id)}/messages?limit=50`);
      setThread(r.messages.map((m: Msg) => ({ role: m.role === 'user' ? 'user' : 'agent', text: m.content })));
    } catch (e: any) { setMsg(e.message); }
  };

  const send = () => {
    const text = input.trim();
    if (!text || !chatAgent || busy) return;
    setInput('');
    setBusy(true);
    setThread((t) => [...t, { role: 'user', text }, { role: 'agent', text: '', streaming: true }]);
    const params = new URLSearchParams({ message: text, page: location.pathname });
    if (projectId) params.set('projectId', projectId);
    const es = new EventSource(`/api/agents/${encodeURIComponent(chatAgent.id)}/chat?${params}`);
    esRef.current = es;
    es.addEventListener('meta', () => {});
    es.addEventListener('token', (ev) => {
      const { t } = JSON.parse((ev as MessageEvent).data);
      setThread((th) => {
        const next = [...th];
        const last = next[next.length - 1];
        if (last?.role === 'agent') next[next.length - 1] = { ...last, text: last.text + t };
        return next;
      });
    });
    es.addEventListener('done', () => {
      setThread((th) => { const next = [...th]; const last = next[next.length - 1]; if (last?.streaming) next[next.length - 1] = { ...last, streaming: false }; return next; });
      setBusy(false);
      es.close();
    });
    es.addEventListener('error', () => { setBusy(false); es.close(); });
  };

  const packs = ['agency-agents', '500-ai-agents-projects'];

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">AI Agents</h1>
          <p className="text-muted-foreground">
            {agents.length} agents from the vendored MIT packs — enable the ones you want, then chat with them in real time. They see your live workspace as you build.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={pack} onChange={(e) => setPack(e.target.value)}>
            <option value="">All packs</option>
            {packs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Input placeholder="Search agents…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} className="w-52" />
          <Button variant="secondary" onClick={load}>Search</Button>
        </div>
      </div>
      {msg && <p className="text-sm text-destructive">{msg}</p>}

      <div className="flex gap-2 flex-wrap">
        <Badge variant={division === '' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setDivision('')}>All divisions ({divisions.reduce((s, d) => s + d.n, 0)})</Badge>
        {divisions.map((d) => (
          <Badge key={d.division} variant={division === d.division ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setDivision(division === d.division ? '' : d.division)}>
            {d.division} ({d.n})
          </Badge>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2 content-start">
          {agents.map((a) => (
            <Card key={a.id} className={chatAgent?.id === a.id ? 'border-primary' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug"><span className="mr-1">{a.emoji}</span>{a.name}</CardTitle>
                  <Badge variant="secondary">{a.division}</Badge>
                </div>
                <CardDescription className="text-xs line-clamp-3">{a.description || '—'}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <div className="flex gap-1 flex-wrap">
                  {a.tags.slice(0, 4).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
                  {a.difficulty && <Badge variant="outline" className="text-[10px]">{a.difficulty}</Badge>}
                </div>
                <div className="flex gap-2">
                  {a.enabled
                    ? <Button size="sm" onClick={() => openChat(a)}>Chat</Button>
                    : <Button size="sm" variant="secondary" onClick={() => toggle(a)}>Enable</Button>}
                  {a.enabled && <Button size="sm" variant="ghost" onClick={() => toggle(a)}>Disable</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="sticky top-4 self-start">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {chatAgent ? <>{chatAgent.emoji} {chatAgent.name} <Badge variant="secondary" className="ml-1">on-device sovereign</Badge></> : 'Agent chat'}
              </CardTitle>
              <CardDescription>
                {chatAgent ? `${chatAgent.division} · ${chatAgent.license}` : 'Enable an agent and press Chat. Responses stream in real time, grounded in your workspace.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {chatAgent && (
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Context project</label>
                  <select className="h-8 rounded-md border bg-background px-2 text-sm flex-1" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">None</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="h-[420px] overflow-y-auto rounded-md border bg-muted/30 p-3 space-y-2">
                {thread.length === 0 && <p className="text-xs text-muted-foreground p-2">No messages yet. Ask your agent anything about what you are building.</p>}
                {thread.map((m, i) => (
                  <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 'bg-background border'}`}>
                    {m.text}{m.streaming && <span className="animate-pulse">▍</span>}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={chatAgent ? `Ask ${chatAgent.name}…` : 'Enable an agent to chat'}
                  value={input}
                  disabled={!chatAgent || busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <Button onClick={send} disabled={!chatAgent || busy || !input.trim()}>Send</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
