// React codegen target (spec §6 Phase 6) — emits a BUILDABLE
// Vite + React + TypeScript + Tailwind project straight from the canonical
// Lucio Design Document. One component per section type (mirroring the static
// renderer's blocks in templates.js), tokens as CSS variables wired into the
// Tailwind theme, document section order as the page structure. Duplicates get
// unique ids with the same -2/-3 suffix scheme the static renderer uses, so
// canvas operations (hide/reorder/duplicate) carry over to the React target.
import { lddToBrief } from './ldd.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function tsString(s) { return JSON.stringify(String(s ?? '')); }

// ---- section components (one per renderer block) -----------------------------

function heroComponent() {
  return `import type { Site } from '../../data/content';
export default function Hero({ id, site }: { id: string; site: Site }) {
  return (
    <section id={id} className="py-16">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{site.name}</h1>
      <p className="mt-3 text-lg text-muted">{site.tagline}</p>
      <a href="#contact" className="mt-6 inline-block rounded bg-accent px-5 py-2.5 font-bold text-bg">Get in touch</a>
    </section>
  );
}
`;
}

function aboutComponent() {
  return `import type { Site } from '../../data/content';
export default function About({ id, site }: { id: string; site: Site }) {
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">About</h2>
      <p className="mt-2">{site.facts.about || site.name}</p>
    </section>
  );
}
`;
}

function servicesComponent() {
  return `import type { Site } from '../../data/content';
export default function Services({ id, site }: { id: string; site: Site }) {
  const items = site.services.length ? site.services : [\`${'${site.industry}'} service one\`, \`${'${site.industry}'} service two\`, \`${'${site.industry}'} service three\`];
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">Services</h2>
      <ul className="mt-3 grid gap-4 md:grid-cols-3 not-prose">
        {items.map((s, i) => (
          <li key={i} className="rounded bg-surface p-5">{s}</li>
        ))}
      </ul>
    </section>
  );
}
`;
}

function featuresComponent() {
  return `const FEATURES = ['Feature one', 'Feature two', 'Feature three'];
export default function Features({ id }: { id: string; site: Site }) {
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">Features</h2>
      <ul className="mt-3 grid gap-4 md:grid-cols-3 not-prose">
        {FEATURES.map((f) => (
          <li key={f} className="rounded bg-surface p-5">{f}</li>
        ))}
      </ul>
    </section>
  );
}
`;
}

function pricingComponent() {
  return `const PLANS = ['Starter', 'Growth', 'Scale'];
export default function Pricing({ id }: { id: string; site: Site }) {
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">Pricing</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p} className="rounded bg-surface p-5 text-center font-bold">{p}</div>
        ))}
      </div>
    </section>
  );
}
`;
}

function faqComponent() {
  return `import type { Site } from '../../data/content';
export default function Faq({ id, site }: { id: string; site: Site }) {
  const faqs = site.faqs.length ? site.faqs : [{ q: 'What are your hours?', a: 'Contact us for current hours.' }, { q: 'Where are you located?', a: site.facts.address }];
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">FAQ</h2>
      <div className="mt-3 space-y-3">
        {faqs.map((f) => (
          <details key={f.q} className="rounded bg-surface p-4">
            <summary className="cursor-pointer font-semibold">{f.q}</summary>
            <p className="mt-2">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
`;
}

function galleryComponent() {
  return `import type { Site } from '../../data/content';
export default function Gallery({ id }: { id: string; site: Site }) {
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">Gallery</h2>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4" role="img" aria-label="Photo gallery placeholder">
        {['from-surface to-accent/30', 'from-accent/20 to-surface', 'from-surface to-muted/40'].map((g, i) => (
          <div key={i} className={\`aspect-[4/3] rounded bg-gradient-to-br \${g}\`} />
        ))}
      </div>
    </section>
  );
}
`;
}

function contactComponent() {
  return `import { useState } from 'react';
import type { Site } from '../../data/content';
export default function Contact({ id, site }: { id: string; site: Site }) {
  const [sent, setSent] = useState(false);
  return (
    <section id={id} className="py-6 border-t border-muted/25">
      <h2 className="text-2xl md:text-3xl font-bold">Contact</h2>
      <p className="mt-2">{site.facts.phone} · {site.facts.email}</p>
      <p>{site.facts.address}</p>
      {sent ? (
        <p className="mt-4 rounded bg-surface p-4 font-semibold">Thanks — your message has been noted.</p>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
          <div>
            <label htmlFor="cf-name" className="block text-sm font-semibold">Name</label>
            <input id="cf-name" name="name" required className="mt-1 w-full rounded border border-muted bg-surface px-3 py-2" />
          </div>
          <div>
            <label htmlFor="cf-email" className="block text-sm font-semibold">Email</label>
            <input id="cf-email" name="email" type="email" required className="mt-1 w-full rounded border border-muted bg-surface px-3 py-2" />
          </div>
          <div>
            <label htmlFor="cf-msg" className="block text-sm font-semibold">Message</label>
            <textarea id="cf-msg" name="message" required rows={4} className="mt-1 w-full rounded border border-muted bg-surface px-3 py-2" />
          </div>
          <button type="submit" className="rounded bg-accent px-5 py-2.5 font-bold text-bg">Send</button>
        </form>
      )}
    </section>
  );
}
`;
}

const SECTION_COMPONENTS = {
  hero: { name: 'Hero', code: heroComponent },
  about: { name: 'About', code: aboutComponent },
  services: { name: 'Services', code: servicesComponent },
  features: { name: 'Features', code: featuresComponent },
  pricing: { name: 'Pricing', code: pricingComponent },
  faq: { name: 'Faq', code: faqComponent },
  gallery: { name: 'Gallery', code: galleryComponent },
  contact: { name: 'Contact', code: contactComponent },
};

// ---- project files ------------------------------------------------------------

function packageJson(name) {
  return JSON.stringify({
    name: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'lucio-site',
    private: true,
    version: '0.1.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'tsc --noEmit && vite build', preview: 'vite preview' },
    dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: {
      '@types/react': '^18.3.12', '@types/react-dom': '^18.3.1',
      '@vitejs/plugin-react': '^4.3.4', autoprefixer: '^10.4.20',
      postcss: '^8.4.49', tailwindcss: '^3.4.17', typescript: '^5.6.3', vite: '^5.4.11',
    },
  }, null, 2);
}

function viteConfig() {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
`;
}

function tsconfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler',
      allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true,
      noEmit: true, jsx: 'react-jsx', strict: true, noUnusedLocals: false, noUnusedParameters: false,
    },
    include: ['src'],
  }, null, 2);
}

function tailwindConfig() {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', surface: 'var(--surface)', text: 'var(--text)',
        accent: 'var(--accent)', muted: 'var(--muted)',
      },
      fontFamily: {
        body: ['var(--font-body)'], display: ['var(--font-display)'],
      },
    },
  },
  plugins: [],
};
`;
}

function postcssConfig() {
  return `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
`;
}

function indexHtml(name, title) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

function mainTsx() {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
}

function indexCss(tokens) {
  const p = tokens.palette || {};
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: ${p.bg}; --surface: ${p.surface}; --text: ${p.text};
  --accent: ${p.accent}; --muted: ${p.muted}; --radius: ${tokens.radius || '8px'};
  --font-body: ${tokens.fonts?.body || 'system-ui, sans-serif'};
  --font-display: ${tokens.fonts?.display || 'system-ui, sans-serif'};
}

body { @apply bg-bg text-text font-body; }
h1, h2, h3 { @apply font-display; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;
}

function contentTs(brief) {
  const facts = brief.facts || {};
  const pack = brief.contentPack || {};
  const services = Array.isArray(pack.services) ? pack.services.map((s) => String(s)).slice(0, 6) : [];
  const faqs = Array.isArray(pack.faqs) ? pack.faqs.slice(0, 6).map((f) => ({ q: String(f.q || f.question || ''), a: String(f.a || f.answer || '') })) : [];
  return `// Content generated from the Lucio Design Document — edit the document, re-export.
export type Site = {
  name: string; tagline: string; industry: string;
  facts: { about: string; phone: string; email: string; address: string };
  services: string[]; faqs: { q: string; a: string }[];
};

export const site: Site = {
  name: ${tsString(brief.name)},
  tagline: ${tsString(brief.tagline)},
  industry: ${tsString(brief.industry)},
  facts: {
    about: ${tsString(facts.about)}, phone: ${tsString(facts.phone)},
    email: ${tsString(facts.email)}, address: ${tsString(facts.address)},
  },
  services: [${services.map(tsString).join(', ')}],
  faqs: [${faqs.map((f) => `{ q: ${tsString(f.q)}, a: ${tsString(f.a)} }`).join(', ')}],
};
`;
}

function appTsx(sections) {
  // Unique ids per occurrence, same scheme as the static renderer.
  const counts = {};
  const ids = sections.map((s) => { counts[s] = (counts[s] || 0) + 1; return counts[s] > 1 ? `${s}-${counts[s]}` : s; });
  const used = [...new Set(sections)];
  const imports = used.map((t) => `import ${SECTION_COMPONENTS[t].name} from './components/sections/${SECTION_COMPONENTS[t].name}';`).join('\n');
  const nav = ids.map((id) => `            <a key="${id}" href="#${id}" className="font-semibold hover:underline">${id.replace(/-\d+$/, '')[0].toUpperCase() + id.replace(/-\d+$/, '').slice(1)}</a>`).join('\n');
  const body = sections.map((t, i) => `          <${SECTION_COMPONENTS[t].name} key="${ids[i]}" id="${ids[i]}" site={site} />`).join('\n');
  return `import { useState } from 'react';
import { site } from './data/content';
${imports}

export default function App() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 flex flex-wrap items-center gap-x-4 gap-y-2 bg-surface px-6 py-4" aria-label="Primary">
        <button className="md:hidden font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>Menu</button>
        <div className={\`\${open ? 'flex' : 'hidden'} md:flex flex-wrap gap-x-4 gap-y-2\`}>
${nav}
        </div>
      </nav>
      <main className="mx-auto max-w-3xl px-6">
${body}
      </main>
      <footer className="py-8 text-center text-muted">© {new Date().getFullYear()} {site.name}. Built with Lucio.</footer>
    </div>
  );
}
`;
}

// ---- entry point ----------------------------------------------------------------

// ldd → { files: [{path, content}], meta }. Throws {status:400} on invalid docs.
export function generateReactProject(ldd) {
  const brief = lddToBrief(ldd); // validates the document (400 on invalid)
  const tokens = ldd.design?.tokens || {};
  const sections = Array.isArray(brief.sections) && brief.sections.length
    ? brief.sections.filter((t) => SECTION_COMPONENTS[t])
    : ['hero', 'about', 'services', 'faq', 'gallery', 'contact'].filter((t) => SECTION_COMPONENTS[t]);
  if (!sections.length) { const e = new Error('no renderable sections in document'); e.status = 400; throw e; }

  const used = [...new Set(sections)];
  const files = [
    { path: 'package.json', content: packageJson(brief.name) },
    { path: 'vite.config.ts', content: viteConfig() },
    { path: 'tsconfig.json', content: tsconfig() },
    { path: 'index.html', content: indexHtml(brief.name, `${brief.name}${brief.tagline ? ` — ${brief.tagline}` : ''}`) },
    { path: 'tailwind.config.js', content: tailwindConfig() },
    { path: 'postcss.config.js', content: postcssConfig() },
    { path: 'src/main.tsx', content: mainTsx() },
    { path: 'src/index.css', content: indexCss(tokens) },
    { path: 'src/App.tsx', content: appTsx(sections) },
    { path: 'src/data/content.ts', content: contentTs(brief) },
  ];
  for (const t of used) files.push({ path: `src/components/sections/${SECTION_COMPONENTS[t].name}.tsx`, content: SECTION_COMPONENTS[t].code() });

  return {
    files,
    meta: {
      appType: brief.appType, universe: ldd.design?.universe || null,
      sectionTypes: sections, componentCount: used.length,
      fileCount: files.length,
    },
  };
}
