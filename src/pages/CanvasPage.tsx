import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, RefreshCw, Undo2, Redo2, ArrowUp, ArrowDown, Copy,
  Trash2, Eye, EyeOff, Lock, Unlock, AlertTriangle, Square, Type, AlignLeft, Link2,
  Image as ImageIcon, List, MousePointerClick, TextCursorInput, Rows3, ChevronRight, ChevronDown,
  SlidersHorizontal, Download,
} from 'lucide-react';

// Phase 5 — property inspector. Only fields the renderer ACTUALLY consumes
// (verified against templates.js renderCss/renderSiteHtml and lddToBrief):
// palette bg/surface/text/accent/muted, radius, fonts; content.tagline and
// facts.about/phone/email/address; per-section hidden/locked. Every edit is a
// document write + re-render, so the canvas, files and document stay one truth.
type InspectorDraft = {
  tagline: string;
  about: string; phone: string; email: string; address: string;
  palette: { bg: string; surface: string; text: string; accent: string; muted: string };
  radius: string;
  fontBody: string; fontDisplay: string;
};
const PALETTE_FIELDS: { key: keyof InspectorDraft['palette']; label: string }[] = [
  { key: 'bg', label: 'Background' },
  { key: 'surface', label: 'Surface' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
  { key: 'muted', label: 'Muted' },
];

// Phase 4 — Visual canvas + layer tree (spec §4/§5). The layer tree is the
// REAL element tree parsed from the rendered page; canvas operations mutate
// the canonical Lucio Design Document and re-render through it (Phase 2 write
// path) — canvas and source can never drift apart.

type LayerNode = {
  id: string; path: number[]; tag: string; label: string; domId: string | null;
  classes: string[]; children: LayerNode[];
  sectionId?: string; sectionType?: string; locked?: boolean;
};
type LayerDoc = {
  sections: { id: string; type: string; hidden: boolean; locked: boolean }[];
  staleAt: string | null; stalePaths: string[]; fingerprint: string | null;
};
type LayersResponse = { page: { id: string; label: string }; tree: LayerNode[]; document: LayerDoc };
type LddDoc = {
  schemaVersion: string;
  pages: { id: string; route: string; title: string; sections: { id: string; type: string; hidden?: boolean; locked?: boolean }[] }[];
  [k: string]: unknown;
};

const TAG_ICON: Record<string, typeof Square> = {
  section: Rows3, nav: Rows3, footer: Rows3, div: Square,
  h1: Type, h2: Type, h3: Type, p: AlignLeft, a: Link2, button: MousePointerClick,
  img: ImageIcon, ul: List, ol: List, li: List, form: TextCursorInput, iframe: Square,
};

function iconFor(tag: string) { return TAG_ICON[tag] || Square; }

export default function CanvasPage() {
  const { projectId: paramId } = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState(paramId || '');
  const [layers, setLayers] = useState<LayersResponse | null>(null);
  const [ldd, setLdd] = useState<LddDoc | null>(null);
  const [selected, setSelected] = useState<{ id: string; path: number[]; sectionId?: string; locked?: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const [clipboard, setClipboard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [frameTick, setFrameTick] = useState(0);
  const [draft, setDraft] = useState<InspectorDraft | null>(null);

  useEffect(() => {
    if (!ldd) return;
    const t = (ldd as any).design?.tokens || {};
    const pal = t.palette || {};
    const f = ((ldd as any).content?.facts || {}) as Record<string, string>;
    setDraft({
      tagline: String((ldd as any).content?.tagline || ''),
      about: String(f.about || ''), phone: String(f.phone || ''),
      email: String(f.email || ''), address: String(f.address || ''),
      palette: {
        bg: String(pal.bg || '#ffffff'), surface: String(pal.surface || '#ffffff'),
        text: String(pal.text || '#111111'), accent: String(pal.accent || '#111111'),
        muted: String(pal.muted || '#666666'),
      },
      radius: String(t.radius || '8px'),
      fontBody: String(t.fonts?.body || 'system-ui, sans-serif'),
      fontDisplay: String(t.fonts?.display || 'system-ui, sans-serif'),
    });
  }, [ldd]);

  useEffect(() => { api<{ projects: { id: string; name: string }[] }>('/nexus/projects').then((r) => setProjects(r.projects)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (paramId) setProjectId(paramId); }, [paramId]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError('');
    try {
      const [l, d] = await Promise.all([
        api<LayersResponse>(`/nexus/projects/${projectId}/layers`),
        api<{ ldd: LddDoc }>(`/nexus/projects/${projectId}/ldd`),
      ]);
      setLayers(l); setLdd(d.ldd);
    } catch (e: any) { setError(e.message); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // ---- two-way selection: tree click ↔ iframe highlight --------------------
  const highlight = useCallback((path: number[] | null) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll('[data-lucio-canvas]').forEach((el) => {
      el.removeAttribute('data-lucio-canvas');
      (el as HTMLElement).style.outline = '';
      (el as HTMLElement).style.outlineOffset = '';
    });
    if (!path) return;
    let el: Element | null = doc.querySelector('main') || doc.body;
    for (const idx of path) { el = el?.children?.[idx] || null; if (!el) return; }
    const he = el as HTMLElement;
    he.setAttribute('data-lucio-canvas', '1');
    he.style.outline = '2px solid #c8a15a';
    he.style.outlineOffset = '2px';
    he.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  useEffect(() => { highlight(selected?.path || null); }, [selected, frameTick, highlight]);

  // ---- document mutations ---------------------------------------------------
  const saveAndRender = async (doc: LddDoc, recordHistory: boolean) => {
    if (!projectId) return;
    setBusy(true); setError('');
    try {
      if (recordHistory) {
        const next = [...history.slice(0, hIndex + 1), JSON.stringify(doc)];
        if (next.length > 50) next.shift();
        setHistory(next); setHIndex(next.length - 1);
      }
      await api(`/nexus/projects/${projectId}/ldd`, { method: 'PUT', body: JSON.stringify({ ldd: doc, render: true }) });
      setLdd(doc);
      setFrameTick((t) => t + 1);
      await load();
    } catch (e: any) { setError(e.message); await load(); }
    finally { setBusy(false); }
  };

  const mutateSections = (fn: (sections: LddDoc['pages'][0]['sections']) => void) => {
    if (!ldd) return;
    const doc: LddDoc = JSON.parse(JSON.stringify(ldd));
    fn(doc.pages[0].sections);
    return saveAndRender(doc, true);
  };

  const selectedSection = selected?.sectionId && ldd
    ? ldd.pages[0].sections.find((s) => s.id === selected.sectionId) : null;

  const guardEditable = () => {
    if (selected?.locked || selectedSection?.locked) { setError('This layer is locked — unlock it first.'); return false; }
    return true;
  };

  const sectionIndex = () => ldd?.pages[0].sections.findIndex((s) => s.id === selected?.sectionId) ?? -1;

  const opMove = (dir: -1 | 1) => {
    if (!guardEditable()) return;
    const i = sectionIndex(); const j = i + dir;
    mutateSections((secs) => { if (i < 0 || j < 0 || j >= secs.length) return; [secs[i], secs[j]] = [secs[j], secs[i]]; });
  };
  const opDuplicate = () => {
    if (!guardEditable()) return;
    const i = sectionIndex();
    mutateSections((secs) => {
      const src = secs[i]; if (!src) return;
      secs.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(src)), id: `${src.id}-copy-${secs.length + 1}` });
    });
  };
  const opCopy = () => {
    if (!selectedSection) return;
    setClipboard(JSON.stringify(selectedSection));
  };
  const opPaste = () => {
    if (!clipboard || !guardEditable()) return;
    const src = JSON.parse(clipboard);
    mutateSections((secs) => {
      const i = sectionIndex();
      secs.splice(i >= 0 ? i + 1 : secs.length, 0, { ...src, id: `${src.type}-paste-${secs.length + 1}` });
    });
  };
  const opDelete = () => {
    if (!guardEditable()) return;
    const id = selected?.sectionId;
    mutateSections((secs) => { const k = secs.findIndex((s) => s.id === id); if (k >= 0) secs.splice(k, 1); });
    setSelected(null);
  };
  const opToggleHide = () => {
    const id = selected?.sectionId;
    mutateSections((secs) => { const s = secs.find((x) => x.id === id); if (s) s.hidden = !s.hidden; });
  };
  const opToggleLock = () => {
    const id = selected?.sectionId;
    mutateSections((secs) => { const s = secs.find((x) => x.id === id); if (s) s.locked = !s.locked; });
  };
  const unhide = (id: string) => mutateSections((secs) => { const s = secs.find((x) => x.id === id); if (s) s.hidden = false; });

  // ---- Phase 5 inspector: document-level writes -------------------------------
  const mutateDoc = (fn: (doc: any) => void, recordHistory = true) => {
    if (!ldd) return;
    const doc: any = JSON.parse(JSON.stringify(ldd));
    fn(doc);
    return saveAndRender(doc, recordHistory);
  };
  const applyDraft = () => {
    if (!draft) return;
    mutateDoc((doc) => {
      doc.content.tagline = draft.tagline;
      doc.content.facts = { ...(doc.content.facts || {}), about: draft.about, phone: draft.phone, email: draft.email, address: draft.address };
      doc.design.tokens.palette = { ...doc.design.tokens.palette, ...draft.palette };
      doc.design.tokens.radius = draft.radius;
      doc.design.tokens.fonts = { ...(doc.design.tokens.fonts || {}), body: draft.fontBody, display: draft.fontDisplay };
    });
  };
  const draftDirty = (() => {
    if (!ldd || !draft) return false;
    const t = (ldd as any).design?.tokens || {};
    const pal = t.palette || {};
    const f = ((ldd as any).content?.facts || {}) as Record<string, string>;
    return draft.tagline !== String((ldd as any).content?.tagline || '')
      || draft.about !== String(f.about || '') || draft.phone !== String(f.phone || '')
      || draft.email !== String(f.email || '') || draft.address !== String(f.address || '')
      || draft.radius !== String(t.radius || '8px')
      || draft.fontBody !== String(t.fonts?.body || '') || draft.fontDisplay !== String(t.fonts?.display || '')
      || PALETTE_FIELDS.some(({ key }) => draft.palette[key] !== String(pal[key] || ''));
  })();
  const sectionProp = (fn: (s: any) => void) => {
    const id = selected?.sectionId;
    mutateSections((secs) => { const s = secs.find((x) => x.id === id); if (s) fn(s); });
  };

  const undo = async () => {
    if (hIndex <= 0) return;
    const doc = JSON.parse(history[hIndex - 1]);
    setHIndex(hIndex - 1);
    await saveAndRender(doc, false);
  };
  const redo = async () => {
    if (hIndex >= history.length - 1) return;
    const doc = JSON.parse(history[hIndex + 1]);
    setHIndex(hIndex + 1);
    await saveAndRender(doc, false);
  };

  // ---- layer tree rendering --------------------------------------------------
  const renderNode = (node: LayerNode, depth: number): ReactNode => {
    const Icon = iconFor(node.tag);
    const isSel = selected?.id === node.id;
    const hasKids = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs cursor-pointer select-none ${isSel ? 'bg-accent/15 text-accent ring-1 ring-accent/40' : 'hover:bg-muted/60'} ${node.locked ? 'opacity-60' : ''}`}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
          onClick={() => setSelected({ id: node.id, path: node.path, sectionId: node.sectionId, locked: node.locked })}
        >
          {hasKids ? (
            <span onClick={(e) => { e.stopPropagation(); setCollapsed((s) => { const n = new Set(s); if (n.has(node.id)) n.delete(node.id); else n.add(node.id); return n; }); }}>
              {isCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
            </span>
          ) : <span className="w-3 shrink-0" />}
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.label}</span>
          {node.locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
        </div>
        {!isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Canvas</h1>
          <p className="text-muted-foreground text-sm">Layer tree over the canonical Lucio Design Document — every edit re-renders through it.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="rounded-md border bg-background px-2 py-1.5 text-xs max-w-[220px]" value={projectId} onChange={(e) => { setProjectId(e.target.value); navigate(`/canvas/${e.target.value}`, { replace: true }); }}>
            <option value="">Pick a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {layers?.document.staleAt && (
            <Badge variant="outline" className="text-amber-600 border-amber-500/40 gap-1"><AlertTriangle className="h-3 w-3" /> files edited outside the document ({layers.document.stalePaths.join(', ')})</Badge>
          )}
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></Button>
          <Button size="sm" variant="outline" disabled={hIndex <= 0 || busy} onClick={undo}><Undo2 className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" disabled={hIndex >= history.length - 1 || busy} onClick={redo}><Redo2 className="h-4 w-4" /></Button>
          {projectId && (
            <a href={`/api/nexus/projects/${projectId}/export/react`} download>
              <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />Export React</Button>
            </a>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!projectId ? (
        <div className="flex-1 rounded-md border border-dashed flex items-center justify-center text-muted-foreground text-sm">
          Choose a NEXUS project to open its canvas. Build one first in the NEXUS Builder.
        </div>
      ) : !layers || !ldd ? (
        <div className="flex-1 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading canvas…</div>
      ) : (
        <div className="flex gap-3 flex-1 min-h-0">
          {/* layer tree */}
          <div className="w-80 shrink-0 rounded-md border bg-card overflow-y-auto p-2 space-y-0.5">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-1.5 py-1">{layers.page.label} — layers</p>
            {layers.tree.map((n) => renderNode(n, 0))}
            {layers.document.sections.some((s) => s.hidden) && (
              <>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-1.5 pt-3">Hidden sections</p>
                {layers.document.sections.filter((s) => s.hidden).map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs opacity-60" style={{ paddingLeft: '18px' }}>
                    <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate flex-1">{s.id} ({s.type})</span>
                    <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={() => unhide(s.id)}>Unhide</Button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* canvas */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {selected && (
              <div className="flex items-center gap-1.5 flex-wrap rounded-md border bg-card px-2 py-1.5">
                <span className="text-xs text-muted-foreground mr-1 truncate max-w-[280px]">
                  {selected.sectionId ? `Section ${selected.sectionId}` : 'Element'} {selected.locked ? '· locked' : ''}
                </span>
                {selected.sectionId && (<>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy || !!selected.locked} onClick={() => opMove(-1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy || !!selected.locked} onClick={() => opMove(1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy || !!selected.locked} onClick={opDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={opCopy}><Copy className="h-3.5 w-3.5 mr-1" />Copy</Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy || !!selected.locked || !clipboard} onClick={opPaste}>Paste</Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy || !!selected.locked} onClick={opToggleHide}><Eye className="h-3.5 w-3.5" /> Hide</Button>
                  <Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={opToggleLock}>
                    {selected.locked || selectedSection?.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7" disabled={busy || !!selected.locked} onClick={opDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
                </>)}
                {!selected.sectionId && <span className="text-[11px] text-muted-foreground">Element-level property editing arrives with the inspector (Phase 5).</span>}
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={frameTick}
              title="canvas-preview"
              className="flex-1 w-full rounded-md border bg-white min-h-0"
              src={`/api/nexus/projects/${projectId}/preview/index.html`}
              onLoad={() => highlight(selected?.path || null)}
            />
          </div>

          {/* Phase 5 inspector — every field here is consumed by the renderer */}
          <div className="w-80 shrink-0 rounded-md border bg-card overflow-y-auto p-3 space-y-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><SlidersHorizontal className="h-3.5 w-3.5" /> Inspector</p>

            {selected?.sectionId && selectedSection && (
              <div className="space-y-2">
                <p className="text-xs font-semibold">Section — {selected.sectionId}</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Type</span><span>{String((selectedSection as any).type)}</span>
                </div>
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="text-muted-foreground">Hidden</span>
                  <input type="checkbox" checked={!!(selectedSection as any).hidden} onChange={(e) => sectionProp((s) => { s.hidden = e.target.checked; })} />
                </label>
                <label className="flex items-center justify-between text-xs cursor-pointer">
                  <span className="text-muted-foreground">Locked</span>
                  <input type="checkbox" checked={!!(selectedSection as any).locked} onChange={(e) => sectionProp((s) => { s.locked = e.target.checked; })} />
                </label>
              </div>
            )}

            {draft && (<>
              <div className="space-y-2">
                <p className="text-xs font-semibold">Design tokens</p>
                {PALETTE_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <div className="flex items-center gap-1.5">
                      <code className="text-[10px] text-muted-foreground">{draft.palette[key]}</code>
                      <input type="color" value={draft.palette[key]} className="h-6 w-8 cursor-pointer rounded border bg-background p-0.5"
                        onChange={(e) => setDraft({ ...draft, palette: { ...draft.palette, [key]: e.target.value } })} />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">Corner radius</span>
                  <div className="flex items-center gap-1.5">
                    <input type="range" min={0} max={24} step={1} value={parseInt(draft.radius, 10) || 0}
                      onChange={(e) => setDraft({ ...draft, radius: `${e.target.value}px` })} className="w-20" />
                    <code className="text-[10px] text-muted-foreground w-8">{draft.radius}</code>
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <label className="text-[11px] text-muted-foreground block">Body font stack</label>
                  <input className="w-full rounded border bg-background px-2 py-1 text-xs" value={draft.fontBody}
                    onChange={(e) => setDraft({ ...draft, fontBody: e.target.value })} />
                  <label className="text-[11px] text-muted-foreground block">Display font stack</label>
                  <input className="w-full rounded border bg-background px-2 py-1 text-xs" value={draft.fontDisplay}
                    onChange={(e) => setDraft({ ...draft, fontDisplay: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold">Content</p>
                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">Tagline (hero)</span>
                  <input className="w-full rounded border bg-background px-2 py-1 text-xs" value={draft.tagline}
                    onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] text-muted-foreground">About text</span>
                  <textarea rows={3} className="w-full rounded border bg-background px-2 py-1 text-xs" value={draft.about}
                    onChange={(e) => setDraft({ ...draft, about: e.target.value })} />
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {([['phone', 'Phone'], ['email', 'Email'], ['address', 'Address']] as const).map(([k2, label]) => (
                    <label key={k2} className="block space-y-1">
                      <span className="text-[11px] text-muted-foreground">{label}</span>
                      <input className="w-full rounded border bg-background px-2 py-1 text-xs" value={draft[k2]}
                        onChange={(e) => setDraft({ ...draft, [k2]: e.target.value })} />
                    </label>
                  ))}
                </div>
              </div>

              <Button size="sm" className="w-full" disabled={busy || !draftDirty} onClick={applyDraft}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null} Apply & re-render
              </Button>
              <p className="text-[10px] text-muted-foreground">Writes go through the canonical document — styles.css and index.html re-render, custom files are preserved, and a checkpoint is created.</p>
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}
