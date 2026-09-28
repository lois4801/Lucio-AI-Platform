// Layer tree (spec §5) — the REAL element tree of the generated page, parsed
// from index.html with cheerio. Page → sections → elements, with index paths
// addressable inside the sandboxed same-origin preview iframe (canvas uses
// children-only indices, which match between cheerio and the browser DOM).
// Nodes are annotated with the LDD section they correspond to (rendered
// sections in document order; hidden sections never render, so they never
// appear here — the canvas lists them separately from the document).
import * as cheerio from 'cheerio';
import { getLdd } from './ldd.js';

const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'title', 'head']);

function textSnippet($, el, max = 48) {
  const t = $(el).text().replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function labelFor($, el, tag) {
  const idAttr = $(el).attr('id');
  const cls = ($(el).attr('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  switch (tag) {
    case 'section': return idAttr ? `Section — ${idAttr}` : 'Section';
    case 'h1': return `H1 — ${textSnippet($, el, 40)}`;
    case 'h2': return `H2 — ${textSnippet($, el, 40)}`;
    case 'h3': return `H3 — ${textSnippet($, el, 40)}`;
    case 'p': return textSnippet($, el) ? `Text — ${textSnippet($, el)}` : 'Text';
    case 'a': return `Link — ${textSnippet($, el, 32) || $(el).attr('href') || ''}`;
    case 'button': return `Button — ${textSnippet($, el, 32)}`;
    case 'img': return `Image — ${$(el).attr('alt') || $(el).attr('src') || ''}`;
    case 'form': return `Form — ${$(el).attr('id') || ''}`;
    case 'input': return `Input — ${$(el).attr('name') || $(el).attr('type') || ''}`;
    case 'textarea': return `Textarea — ${$(el).attr('name') || ''}`;
    case 'label': return `Label — ${textSnippet($, el, 32)}`;
    case 'ul': case 'ol': return `List (${$(el).children('li').length} items)`;
    case 'li': return `Item — ${textSnippet($, el, 36)}`;
    case 'details': return `Accordion — ${textSnippet($, el, 36)}`;
    case 'summary': return `Summary — ${textSnippet($, el, 36)}`;
    case 'iframe': return `Embed — ${$(el).attr('title') || 'iframe'}`;
    case 'table': return 'Table';
    case 'nav': return `Nav — ${textSnippet($, el, 24)}`;
    case 'footer': return 'Footer';
    case 'div': return cls ? `Container .${cls}` : 'Container';
    default: return tag;
  }
}

function walk($, el, path, out) {
  const tag = el.tagName?.toLowerCase();
  if (!tag || SKIP_TAGS.has(tag)) return;
  const node = {
    id: path.join('.'),
    path,
    tag,
    label: labelFor($, el, tag),
    domId: $(el).attr('id') || null,
    classes: ($(el).attr('class') || '').split(/\s+/).filter(Boolean),
    children: [],
  };
  out.push(node);
  $(el).children().each((i, child) => walk($, child, [...path, i], node.children));
}

// Parse the page tree. Returns { page, sections } where sections are the
// top-level <main> children annotated with their LDD section counterpart.
export function parseLayerTree(html) {
  const $ = cheerio.load(String(html || ''));
  const pageTitle = $('title').first().text().trim() || 'Page';
  const children = [];
  const main = $('main').first();
  const root = main.length ? main : $('body').first();
  root.children().each((i, el) => walk($, el, [i], children));
  return { page: { id: 'page', label: pageTitle, route: '/' }, tree: children };
}

// Full layer view for a project: the parsed tree annotated with LDD section
// metadata (type, hidden/locked flags from the document), plus the hidden
// sections listed separately so the canvas can offer unhide.
export function projectLayers(orgId, projectId, files) {
  const htmlFile = files.find((f) => f.path === 'index.html');
  const { page, tree } = parseLayerTree(htmlFile ? htmlFile.content : '');
  const state = getLdd(orgId, projectId);
  const lddSections = state?.ldd?.pages?.[0]?.sections || [];
  const visible = lddSections.filter((s) => !s.hidden);
  let vi = 0;
  for (const node of tree) {
    if (node.tag === 'section') {
      const sec = visible[vi++];
      if (sec) { node.sectionId = sec.id; node.sectionType = sec.type; node.locked = !!sec.locked; }
    }
  }
  return {
    page,
    tree,
    document: {
      sections: lddSections.map((s) => ({ id: s.id, type: s.type, hidden: !!s.hidden, locked: !!s.locked })),
      staleAt: state?.ldd?.meta?.staleAt || null,
      stalePaths: state?.ldd?.meta?.stalePaths || [],
      fingerprint: state?.fingerprint || null,
    },
  };
}
