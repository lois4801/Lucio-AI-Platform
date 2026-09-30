import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bot, CheckCircle2, RefreshCw, Send, Sparkles, Users, XCircle } from 'lucide-react';

type Agent = { role: string; agent_id: string; display_name: string; division: string };
type Applied = { summary: string; kind: string; editId: string; version: number | null };
type Failed = { summary: string; kind: string; error: string };
type AgentNote = { role?: string; note?: string };
type EditorReply = {
  reply: string;
  applied: Applied[];
  failed: Failed[];
  agents: Agent[];
  agentNotes: AgentNote[];
  provider?: string | null;
  model?: string | null;
  fallback?: boolean;
};
type Message = {
  from: 'user' | 'agents';
  text: string;
  agents?: Agent[];
  agentNotes?: AgentNote[];
  applied?: Applied[];
  failed?: Failed[];
  fallback?: boolean;
};

type Props = {
  projectId: string;
  selectedPath?: string;
  selectedLabel?: string;
  onApplied?: () => void;
};

const STARTERS = [
  'Make the selected text shorter and more premium.',
  'Make the hero feel more cinematic but keep it readable on mobile.',
  'Use a warmer luxury style for this website.',
  'Hide the FAQ section for now.',
];

export default function WebsiteEditorChat({ projectId, selectedPath = '', selectedLabel = '', onApplied }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (preset?: string) => {
    const text = String(preset ?? input).trim();
    if (!text || !projectId || busy) return;
    const prior = messages.slice(-10).map((message) => ({ role: message.from === 'user' ? 'user' : 'assistant', content: message.text }));
    setMessages((rows) => [...rows, { from: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const result = await api<EditorReply>('/assistant/editor', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          message: text,
          selectedPath,
          selectedLabel,
          history: prior,
        }),
      });
      setMessages((rows) => [...rows, {
        from: 'agents',
        text: result.reply,
        agents: result.agents,
        agentNotes: result.agentNotes,
        applied: result.applied,
        failed: result.failed,
        fallback: result.fallback,
      }]);
      if (result.applied?.length) onApplied?.();
    } catch (e: any) {
      setMessages((rows) => [...rows, { from: 'agents', text: e?.message || 'The editor agents could not complete that request.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden border-primary/20 shadow-sm">
      <CardHeader className="pb-3 bg-primary/[0.03]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Talk to your website</CardTitle>
            <CardDescription className="mt-1">Speak naturally. NEXUS routes the request to the right Lucio agents, applies validated edits, then refreshes the preview.</CardDescription>
          </div>
          <Badge variant="outline" className="gap-1 whitespace-nowrap"><Users className="h-3 w-3" /> Multi-agent</Badge>
        </div>
        {selectedPath && (
          <div className="mt-2 rounded-lg border bg-background px-3 py-2 text-xs">
            <span className="text-muted-foreground">Selected:</span> <span className="font-medium">{selectedLabel || selectedPath}</span>
            <span className="ml-2 text-[10px] text-muted-foreground">You can refer to it as “this”.</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div ref={scrollRef} className="max-h-[350px] min-h-[210px] overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <div className="mb-1 flex items-center gap-2 font-medium text-foreground"><Bot className="h-4 w-4" /> NEXUS Website Editor</div>
                Tell me what you want as if you were talking to a designer sitting beside you. I can change copy, style, motion, section visibility/order, and supported media slots. I will not publish or touch anything outside this project.
              </div>
              <div className="grid gap-1.5">
                {STARTERS.map((starter) => (
                  <button key={starter} type="button" onClick={() => send(starter)} className="rounded-lg border px-3 py-2 text-left text-[11px] hover:bg-muted/50 transition-colors">
                    “{starter}”
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[92%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${message.from === 'user' ? 'bg-primary text-primary-foreground' : 'border bg-background'}`}>
                {message.from === 'agents' && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(message.agents || []).map((agent) => (
                      <Badge key={`${index}-${agent.role}`} variant="secondary" className="text-[9px]">{agent.display_name.split('—')[0].trim()}</Badge>
                    ))}
                    {message.fallback && <Badge variant="outline" className="text-[9px]">Local fallback</Badge>}
                  </div>
                )}

                <div className="whitespace-pre-wrap">{message.text}</div>

                {!!message.agentNotes?.length && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {message.agentNotes.filter((note) => note?.note).map((note, noteIndex) => (
                      <div key={noteIndex} className="text-[10px] text-muted-foreground"><span className="font-medium text-foreground">{note.role || 'agent'}:</span> {note.note}</div>
                    ))}
                  </div>
                )}

                {!!message.applied?.length && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {message.applied.map((item) => (
                      <div key={item.editId} className="flex items-start gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{item.summary}{item.version ? ` · version ${item.version}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}

                {!!message.failed?.length && (
                  <div className="mt-2 space-y-1 border-t pt-2">
                    {message.failed.map((item, failedIndex) => (
                      <div key={`${item.kind}-${failedIndex}`} className="flex items-start gap-1.5 text-[10px] text-destructive">
                        <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{item.summary}: {item.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Your agents are planning, validating, applying and rebuilding…
            </div>
          )}
        </div>

        <div className="border-t p-2.5">
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={selectedPath ? `Tell your agents what to do with ${selectedLabel || 'the selected element'}…` : 'Tell your agents what you want changed…'}
              className="min-h-[52px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Button size="icon" className="h-[52px] w-11 shrink-0" onClick={() => send()} disabled={busy || !input.trim() || !projectId}>
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">Enter to send · Shift+Enter for a new line · Direct instructions are audited and versioned.</div>
        </div>
      </CardContent>
    </Card>
  );
}
