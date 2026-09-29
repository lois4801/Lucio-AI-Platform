import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, X, Send, CheckCircle2, Circle, Bot } from 'lucide-react';

type Agent = { role: string; display_name: string; division: string; agent_id: string };
type Tip = { key: string; text: string; route: string; agent: string };
type Journey = { steps: { id: string; label: string; route: string; done: boolean }[]; done: number; total: number; complete: boolean; next: { id: string; label: string; route: string } | null };
type Ctx = { agent: Agent; greeting: string; tips: Tip[]; journey: Journey; nextBestAction: { label: string; route: string }; squadSize: number };
type Msg = { from: 'user' | 'agent'; text: string; agentName?: string };

export default function AssistantPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tips, setTips] = useState<Tip[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api<Ctx>(`/assistant/context?route=${encodeURIComponent(location.pathname)}`)
      .then((c) => { setCtx(c); setTips(c.tips); })
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [msgs, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { from: 'user', text }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string; agent: Agent; actions: { label: string; route: string }[] }>('/assistant/chat', {
        method: 'POST', body: JSON.stringify({ message: text, route: location.pathname, history: msgs.slice(-12).map(m => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text })) }),
      });
      setMsgs((m) => [...m, { from: 'agent', text: r.reply, agentName: r.agent.display_name }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { from: 'agent', text: `Something went wrong: ${e.message}` }]);
    } finally { setBusy(false); }
  };

  const dismiss = async (key: string) => {
    setTips((t) => t.filter((x) => x.key !== key));
    api('/assistant/dismiss', { method: 'POST', body: JSON.stringify({ tipKey: key }) }).catch(() => {});
  };

  return (
    <>
      {/* floating toggle — kept clear of the mobile safe area */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-3 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
        style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
        title="Lucio Assistant — always on"
      >
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">Assistant</span>
        {tips.length > 0 && <span className="flex h-2 w-2 rounded-full bg-accent-foreground bg-yellow-300" />}
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-20 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[22rem]">
          {/* header */}
          <div className="p-4 border-b bg-sidebar">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-primary/15 grid place-items-center"><Bot className="h-5 w-5 text-primary" /></div>
                <div>
                  <div className="text-sm font-bold leading-tight">{ctx?.agent.display_name || 'Lucio Assistant'}</div>
                  <div className="text-[11px] text-muted-foreground">{ctx?.agent.division} · {ctx?.squadSize} agents on staff</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            {ctx && <p className="text-xs text-muted-foreground mt-2">{ctx.greeting} {ctx.journey.done}/{ctx.journey.total} journey steps done.</p>}
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {/* journey checklist */}
            {ctx && (
              <div className="p-3 border-b">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Your journey</div>
                <div className="space-y-1">
                  {ctx.journey.steps.map((s) => (
                    <button key={s.id} onClick={() => navigate(s.route)}
                      className="flex items-center gap-2 text-left w-full rounded px-1.5 py-1 text-xs hover:bg-sidebar-accent/50">
                      {s.done ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className={s.done ? 'line-through text-muted-foreground' : ''}>{s.label}</span>
                    </button>
                  ))}
                </div>
                {ctx.nextBestAction && !ctx.journey.complete && (
                  <Button size="sm" className="w-full mt-2" onClick={() => { navigate(ctx.nextBestAction.route); setOpen(false); }}>
                    Next: {ctx.nextBestAction.label}
                  </Button>
                )}
              </div>
            )}

            {/* proactive tips */}
            {tips.length > 0 && (
              <div className="p-3 border-b space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Proactive guidance</div>
                {tips.map((t) => (
                  <div key={t.key} className="rounded-lg border bg-sidebar/50 p-2.5 text-xs leading-relaxed">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary" className="text-[10px]">{t.agent.split('—')[0].trim()}</Badge>
                      <button onClick={() => dismiss(t.key)} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
                    </div>
                    <p className="mt-1.5">{t.text}</p>
                    <button className="text-primary font-semibold mt-1" onClick={() => { navigate(t.route); setOpen(false); }}>Take me there</button>
                  </div>
                ))}
              </div>
            )}

            {/* conversation */}
            <div className="p-3 space-y-2.5">
              {msgs.length === 0 && <p className="text-xs text-muted-foreground">Ask about scanning, evidence, opportunities, building, design, content, media, QA, SEO, CRM, budgets — or type <b>what next</b>.</p>}
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.from === 'user' ? 'bg-primary text-primary-foreground' : 'bg-sidebar border'}`}>
                    {m.from === 'agent' && m.agentName && <div className="text-[10px] font-bold text-primary mb-0.5">{m.agentName.split('—')[0].trim()}</div>}
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && <div className="text-xs text-muted-foreground">Assistant is thinking…</div>}
            </div>
          </div>

          {/* input */}
          <div className="p-2.5 border-t flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Ask your assistant…"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button size="icon" className="h-8 w-8" onClick={send} disabled={busy}><Send className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      )}
    </>
  );
}
