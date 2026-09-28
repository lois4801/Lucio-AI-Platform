import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type Suggestion = { id: string; name: string; emoji: string; division: string; description: string; score: number; reason: string };
type ThreadMsg = { role: 'user' | 'agent'; text: string; streaming?: boolean };

// Contextual agent assist — the right specialist offers help for whatever the
// user is building on this page. Suggestions come from the enabled directory
// agents (deterministic match); chatting streams the sovereign on-device reply,
// grounded in the live workspace context passed via props.
export default function AgentAssist({ context, industry = '', projectId = '', scanId = '', prospectId = '' }: { context: string; industry?: string; projectId?: string; scanId?: string; prospectId?: string }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [hint, setHint] = useState('');
  const [openAgent, setOpenAgent] = useState<Suggestion | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ context });
    if (industry) params.set('industry', industry);
    api<{ suggestions: Suggestion[]; hint: string }>(`/agents/suggest?${params}`)
      .then((r) => { setSuggestions(r.suggestions || []); setHint(r.hint || ''); })
      .catch(() => {});
  }, [context, industry]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread]);
  useEffect(() => () => { esRef.current?.close(); }, []);

  const chat = (s: Suggestion) => {
    setOpenAgent(openAgent?.id === s.id ? null : s);
    setThread([]);
  };

  const send = () => {
    const text = input.trim();
    if (!text || !openAgent || busy) return;
    setInput('');
    setBusy(true);
    setThread((t) => [...t, { role: 'user', text }, { role: 'agent', text: '', streaming: true }]);
    const params = new URLSearchParams({ message: text, page: context });
    if (projectId) params.set('projectId', projectId);
    if (scanId) params.set('scanId', scanId);
    if (prospectId) params.set('prospectId', prospectId);
    const es = new EventSource(`/api/agents/${encodeURIComponent(openAgent.id)}/chat?${params}`);
    esRef.current?.close();
    esRef.current = es;
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
    es.addEventListener('error', (ev) => {
      let error = 'Agent connection failed. Please retry or check AI Providers.';
      try { error = JSON.parse((ev as MessageEvent).data).error || error; } catch { /* transport error */ }
      setThread(th => { const next = [...th]; next[next.length - 1] = { role: 'agent', text: error, streaming: false }; return next; });
      setBusy(false); es.close();
    });
  };

  if (!suggestions.length && !hint) return null;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <button className="w-full flex items-center justify-between px-4 py-2.5 text-left" onClick={() => setCollapsed(!collapsed)}>
        <span className="text-sm font-semibold flex items-center gap-2">
          🤖 Agent assist
          {suggestions.length > 0 && <Badge variant="secondary" className="text-[10px]">{suggestions.length} specialist{suggestions.length > 1 ? 's' : ''} online</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">{collapsed ? 'show ▾' : 'hide ▴'}</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-3">
          {suggestions.length === 0 && <p className="text-xs text-muted-foreground">{hint}</p>}
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s.id} onClick={() => chat(s)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${openAgent?.id === s.id ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}>
                <span>{s.emoji}</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground">{s.reason}</span>
              </button>
            ))}
          </div>
          {openAgent && (
            <div className="space-y-2">
              <div className="h-56 overflow-y-auto rounded-md border bg-muted/30 p-3 space-y-2">
                {thread.length === 0 && (
                  <p className="text-xs text-muted-foreground p-1">
                    {openAgent.emoji} <strong>{openAgent.name}</strong> ({openAgent.division}) — {openAgent.description || 'ask me anything about what you are building.'}
                  </p>
                )}
                {thread.map((m, i) => (
                  <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-xs whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 'bg-background border'}`}>
                    {m.text}{m.streaming && <span className="animate-pulse">▍</span>}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="flex gap-2">
                <Input placeholder={`Ask ${openAgent.name}…`} value={input} disabled={busy} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
                <Button size="sm" onClick={send} disabled={busy || !input.trim()}>Send</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
