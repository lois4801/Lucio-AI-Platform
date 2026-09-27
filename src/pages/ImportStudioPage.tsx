import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Check, Copy, CheckCheck, ExternalLink, Globe, Loader2, RotateCcw, Rocket,
  Save, Search, Sparkles, LayoutTemplate, Wand2, FileCode2, ImageOff,
} from 'lucide-react';

type EditableText = { id: string; tag: string; context: string; text: string };
type ImportState = {
  project: { id: string; name: string; status: string };
  import: { id: string; sourceUrl: string; finalUrl: string; title: string; bytes: number; createdAt: string } | null;
  version: number;
  texts: EditableText[];
  snippetCount: number;
  assets: { url: string; kind: string; bytes: number; inlined: boolean; reason?: string }[];
};
type Snippet = { kind: string; name: string; hint?: string; content: string; chars?: number; src?: string };

export default function ImportStudioPage() {
  const { projectId = '' } = useParams();
  const [state, setState] = useState<ImportState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('');
  const [staged, setStaged] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'apply' | 'reset' | 'template' | 'publish' | ''>('');
  const [notice, setNotice] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [showTemplateInput, setShowTemplateInput] = useState(false);
  const [liveSlug, setLiveSlug] = useState('');
  const [tab, setTab] = useState<'texts' | 'effects'>('texts');
  const [effects, setEffects] = useState<{ snippets: Snippet[]; assets: ImportState['assets'] } | null>(null);
  const [effectsLoaded, setEffectsLoaded] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(() => {
    api<ImportState>(`/imports/project/${projectId}`)
      .then(setState)
      .catch((e) => setLoadError(e.message));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const loadEffects = () => {
    if (effectsLoaded) return;
    api<{ snippets: Snippet[]; assets: ImportState['assets'] }>(`/imports/project/${projectId}/snippets`)
      .then((d) => { setEffects(d); setEffectsLoaded(true); })
      .catch(() => {});
  };
  const copySnippet = (key: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    }).catch(() => {});
  };

  const stagedCount = Object.keys(staged).length;
  const texts = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return state?.texts || [];
    return (state?.texts || []).filter((t) => t.text.toLowerCase().includes(q) || t.context.toLowerCase().includes(q));
  }, [state, filter]);

  if (loadError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild><Link to="/projects"><ArrowLeft className="h-4 w-4 mr-1" /> Projects</Link></Button>
        <p className="text-destructive">{loadError}</p>
      </div>
    );
  }
  if (!state) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading import…</div>;

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind); setNotice('');
    try { await fn(); } catch (e: any) { setNotice(e.message); } finally { setBusy(''); }
  };

  const apply = () => run('apply', async () => {
    const edits = Object.entries(staged).map(([id, text]) => ({ id, text }));
    const out = await api<{ version: number; applied: number; rejected: { id: string; reason: string }[] }>(
      `/imports/project/${projectId}/texts`, { method: 'PUT', body: JSON.stringify({ edits }) });
    setStaged({}); setOpenId(null); load();
    setNotice(out.rejected.length
      ? `Applied ${out.applied} edit${out.applied === 1 ? '' : 's'} — ${out.rejected.length} rejected (${out.rejected[0].reason})`
      : `Applied ${out.applied} edit${out.applied === 1 ? '' : 's'} — animations and effects untouched`);
  });

  const reset = () => run('reset', async () => {
    await api(`/imports/project/${projectId}/reset`, { method: 'POST' });
    setStaged({}); load(); setNotice('Restored the original imported site.');
  });

  const saveTemplate = () => run('template', async () => {
    const out = await api<{ templateId: string; name: string; snippets: number }>(
      `/imports/project/${projectId}/save-template`,
      { method: 'POST', body: JSON.stringify({ name: templateName || state.import?.title, description: `Imported from ${state.import?.finalUrl || state.import?.sourceUrl}` }) });
    setShowTemplateInput(false); setTemplateName('');
    setNotice(`Template “${out.name}” saved with ${out.snippets} reusable style/script/section snippets.`);
  });

  const publish = () => run('publish', async () => {
    const out = await api<{ site: { slug: string } }>('/sell/publish', { method: 'POST', body: JSON.stringify({ projectId }) });
    setLiveSlug(out.site.slug);
    setNotice('Site is live.');
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild><Link to="/projects"><ArrowLeft className="h-4 w-4 mr-1" /> Projects</Link></Button>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{state.import?.title || state.project.name}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
            <Globe className="h-3.5 w-3.5" />
            Imported from <a className="underline" href={state.import?.finalUrl || state.import?.sourceUrl} target="_blank" rel="noreferrer">{state.import?.sourceUrl}</a>
            <Badge variant="secondary" className="ml-1">v{state.version}</Badge>
            <Badge variant="outline">{state.texts.length} editable texts</Badge>
            <Badge variant="outline">{state.snippetCount} effects/snippets</Badge>
            {state.assets.length > 0 && (
              <Badge variant="default">
                {state.assets.filter((a) => a.inlined).length}/{state.assets.length} assets captured
              </Badge>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={busy !== ''} onClick={reset}>
            {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />} Reset
          </Button>
          <Button variant="outline" size="sm" disabled={busy !== ''} onClick={() => setShowTemplateInput((v) => !v)}>
            <LayoutTemplate className="h-4 w-4 mr-1" /> Save as template
          </Button>
          {liveSlug ? (
            <Button size="sm" asChild><a href={`/live/${liveSlug}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-1" /> Open live site</a></Button>
          ) : (
            <Button size="sm" disabled={busy !== ''} onClick={publish}>
              {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4 mr-1" />} Publish live
            </Button>
          )}
        </div>
      </div>

      {showTemplateInput && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <Input placeholder="Template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="w-72" />
          <Button size="sm" disabled={busy !== ''} onClick={saveTemplate}>
            {busy === 'template' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save template
          </Button>
          <p className="text-xs text-muted-foreground w-full">Saves the current site with its styles, scripts and sections as a reusable starting point for future builds.</p>
        </div>
      )}

      {notice && <p className="text-sm text-primary flex items-center gap-1"><Sparkles className="h-4 w-4" /> {notice}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="rounded-lg border overflow-hidden bg-background">
          <iframe
            key={state.version}
            title="Imported site preview"
            src={`/api/builder/project/${projectId}/preview?v=${state.version}`}
            className="w-full h-[72vh] border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        </div>

        <div className="rounded-lg border bg-card flex flex-col max-h-[72vh]">
          <div className="p-3 border-b space-y-2">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTab('texts')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === 'texts' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                Texts
              </button>
              <button
                type="button"
                onClick={() => { setTab('effects'); loadEffects(); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium ${tab === 'effects' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                Effects &amp; components
              </button>
            </div>
            {tab === 'texts' && (
              <>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input placeholder="Filter texts…" value={filter} onChange={(e) => setFilter(e.target.value)} className="pl-8" />
                </div>
                <Button size="sm" className="w-full" disabled={!stagedCount || busy !== ''} onClick={apply}>
                  {busy === 'apply' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                  Apply {stagedCount || ''} edit{stagedCount === 1 ? '' : 's'}
                </Button>
                <p className="text-[11px] text-muted-foreground">Edits replace text only — scripts, styles, animations and effects stay byte-identical.</p>
              </>
            )}
          </div>

          {tab === 'effects' && (
            <div className="overflow-y-auto flex-1 p-2 space-y-3">
              {!effects && <p className="text-xs text-muted-foreground p-2 flex items-center gap-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading effects…</p>}
              {effects && (
                <>
                  {effects.assets.length > 0 && (
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold flex items-center gap-1"><FileCode2 className="h-3.5 w-3.5" /> Captured assets</h3>
                      {effects.assets.map((a, i) => (
                        <div key={i} className="rounded-md border bg-background/50 px-2 py-1.5 text-[11px]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-mono">{a.url}</span>
                            <Badge variant={a.inlined ? 'default' : 'secondary'} className="text-[9px] shrink-0">
                              {a.inlined ? `${a.kind} · ${(a.bytes / 1024).toFixed(1)} KB` : 'remote'}
                            </Badge>
                          </div>
                          {!a.inlined && a.reason && <p className="text-destructive/80 mt-0.5">{a.reason}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold flex items-center gap-1"><Wand2 className="h-3.5 w-3.5" /> Reusable snippets</h3>
                      {effects.snippets.length > 0 && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                            onClick={() => copySnippet('all-css', effects.snippets.filter((s) => s.kind === 'style').map((s) => s.content).join('\n\n'))}>
                            {copied === 'all-css' ? <CheckCheck className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />} all CSS
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                            onClick={() => copySnippet('all-js', effects.snippets.filter((s) => s.kind === 'script').map((s) => s.content).join('\n\n'))}>
                            {copied === 'all-js' ? <CheckCheck className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />} all JS
                          </Button>
                        </div>
                      )}
                    </div>
                    {effects.snippets.map((s, i) => (
                      <div key={i} className="rounded-md border bg-background/50 px-2 py-1.5 text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium truncate">{s.name}</span>
                            <span className="text-muted-foreground ml-1.5">{s.kind}{s.chars ? ` · ${(s.chars / 1024).toFixed(1)} KB` : ''}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => copySnippet(`s${i}`, s.content)} aria-label={`Copy ${s.name}`}>
                            {copied === `s${i}` ? <CheckCheck className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                        {s.hint && <p className="text-muted-foreground truncate font-mono mt-0.5">{s.hint}</p>}
                        {s.kind === 'script-ref' && <p className="text-muted-foreground truncate font-mono mt-0.5">{s.src}</p>}
                      </div>
                    ))}
                    {!effects.snippets.length && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><ImageOff className="h-3.5 w-3.5" /> No snippets extracted.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'texts' && (
          <div className="overflow-y-auto flex-1 p-2 space-y-1">
            {texts.map((t) => {
              const stagedText = staged[t.id];
              const isOpen = openId === t.id;
              return (
                <div key={t.id} className="rounded-md border bg-background/50">
                  <button
                    type="button"
                    className="w-full text-left px-2.5 py-2"
                    onClick={() => setOpenId(isOpen ? null : t.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{t.context || t.tag}</span>
                      {stagedText !== undefined && <Badge variant="default" className="text-[9px] px-1">staged</Badge>}
                    </div>
                    <p className="text-xs truncate mt-0.5">{stagedText !== undefined ? stagedText : t.text}</p>
                  </button>
                  {isOpen && (
                    <div className="px-2.5 pb-2.5 space-y-1.5">
                      <textarea
                        className="w-full min-h-[72px] rounded-md border bg-background px-2 py-1.5 text-xs"
                        value={stagedText !== undefined ? stagedText : t.text}
                        onChange={(e) => setStaged((s) => ({ ...s, [t.id]: e.target.value }))}
                      />
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setStaged((s) => ({ ...s, [t.id]: stagedText !== undefined ? stagedText : t.text }))}>Stage</Button>
                        {stagedText !== undefined && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStaged((s) => { const n = { ...s }; delete n[t.id]; return n; })}>Undo</Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!texts.length && <p className="text-xs text-muted-foreground p-2">No texts match.</p>}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
