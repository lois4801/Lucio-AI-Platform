// AI Site Author — when the org has AI providers configured in the vault, the site
// itself is WRITTEN by the org's own AI models (BYOK). The reply must satisfy a strict
// single-file contract; anything that fails validation falls back to the deterministic
// cinematic template — an AI typo must never block a build.
import { aiChat } from './multiAi.js';
import { hasAnyKey } from './aiVault.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// External references a generated single-file site may carry. Everything else must be
// self-contained (no arbitrary third-party scripts/styles in client deliverables).
const ALLOWED_EXTERNAL = /^(https?:)?\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.tailwindcss\.com|www\.openstreetmap\.org|openstreetmap\.org)/i;

export function aiSitePrompt(plan) {
  const pack = plan.contentPack || {};
  const u = plan.universe || {};
  const p = u.palette || {};
  const media = plan.media || {};
  const geo = plan.geo || null;
  const services = (pack.services || []).map((s) => `${s.title}: ${s.description}`).join('\n');
  const faqs = (pack.faqs || []).map((f) => `Q: ${f.q} A: ${f.a}`).join('\n');
  const gallery = Array.isArray(media.gallery) ? media.gallery.filter(Boolean).join(', ') : '';
  return `You are the senior creative developer inside the Lucio AI Platform. Author a complete, single-file, LUXURY-GRADE website. Reply with ONE raw JSON object and nothing else — no markdown fences, no commentary. Shape: {"files":{"index.html":"…"}}.

BRAND (verified build inputs — use them verbatim, never invent replacements):
- Business name: ${plan.siteName}
- Industry: ${plan.industry}${plan.location ? `\n- Location: ${plan.location}` : ''}
- Hero headline: ${pack.headline?.text || ''}
- Subline: ${pack.subline?.text || ''}
- Services:\n${services || '- (use industry-appropriate services)'}
- FAQs:\n${faqs || '- (write 3 sensible FAQs)'}

DESIGN SYSTEM (mandatory — build on these exact tokens):
- Colors: --bg ${p.bg || '#0c0a09'}, --panel ${p.panel || '#1c1917'}, --ink ${p.ink || '#fafaf9'}, --accent ${p.accent || '#d4af37'}, --accent2 ${p.accent2 || '#a8a29e'}, --muted ${p.muted || '#a8a29e'}
- Heading font: ${u.fonts?.heading || 'Georgia,serif'}; body font: ${u.fonts?.body || 'system-ui,sans-serif'}
- Corner radius ${u.shape?.radius ?? 14}px; motion personality "${u.motion || 'rise'}"
- Imagery (local media files — reference these exact paths): hero ${media.hero || '(none)'}${gallery ? `; gallery: ${gallery}` : ''}

REQUIRED SECTIONS — a premium site ships ALL of them, in an order YOU choose (never a stock order):
1. Fixed translucent nav: brand, section links, CTA button
2. Cinematic full-screen hero: layered background image, animated headline, subline, two CTAs, scroll hint
3. Services grid using the services above (numbered or icon-accented cards, hover motion)
4. Booking section: service select, date picker, time-slot select, name + phone — on submit, preventDefault and show an inline success message (NO network calls)
5. Availability strip: a Mon–Sun board with a few open time chips per day
6. Gallery: 3–6 images from the gallery paths above with hover zoom / lightbox feel
7. Testimonials: 3 elegant quote cards — quote text "[EDIT: paste a real client review here]", author "[EDIT: client name]"
8. Packages: 3 pricing tiers from the services — price shown as "[EDIT: price]"
9. Team: 3 role cards (role title + "[EDIT: name & short bio]") with circular portraits from gallery images
10. FAQ accordion using the FAQs above
11. Contact: enquiry form (name, email, message — standalone success message, NO network calls)${geo && Number.isFinite(Number(geo.lat)) ? ` plus this keyless live map iframe: <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${(Number(geo.lng) - 0.014).toFixed(6)}%2C${(Number(geo.lat) - 0.009).toFixed(6)}%2C${(Number(geo.lng) + 0.014).toFixed(6)}%2C${(Number(geo.lat) + 0.009).toFixed(6)}&layer=mapnik&marker=${Number(geo.lat).toFixed(6)}%2C${Number(geo.lng).toFixed(6)}" style="border:0;width:100%;height:320px" loading="lazy"></iframe>` : ''}
12. Rich footer: hours, contact placeholders, social placeholders, copyright with the business name

HARD REQUIREMENTS (an automated validator rejects violations):
- ONE self-contained index.html: all CSS in a <style> in <head>, all JS in a <script> before </body>. The ONLY external references allowed are Google Fonts, cdn.tailwindcss.com, and the OpenStreetMap iframe above.
- Never use eval(, new Function(, document.write( or external scripts.
- Responsive, mobile-first, with buttery motion: IntersectionObserver scroll reveals, animated buttons, hover transitions — and a @media (prefers-reduced-motion: reduce) kill switch.
- The business name "${plan.siteName}" appears in the nav, the hero, and the footer.
- Vary the layout rhythm, spacing and decorative details — the result must feel bespoke, never a recycled template.
- Keep the file between 20 KB and 120 KB.`;
}

// Parse the AI reply: markdown fence stripping, then the outermost JSON object.
export function extractAiSite(content) {
  let raw = String(content || '').trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object in the reply');
  const parsed = JSON.parse(raw.slice(start, end + 1));
  const files = parsed && typeof parsed.files === 'object' && parsed.files ? parsed.files : null;
  if (!files || typeof files['index.html'] !== 'string' || !files['index.html'].trim()) throw new Error('missing files["index.html"]');
  return files['index.html'];
}

// Acceptance rules mirror the platform's mandatory evidence checks (doctype/lang/
// viewport/title, no unsafe dynamic execution, no hardcoded secrets) plus luxury
// gates: the brand name must be present and the page must actually be a full site.
export function validateAiSite(html, plan) {
  const reasons = [];
  const h = String(html || '');
  if (!/<!doctype html/i.test(h)) reasons.push('missing doctype');
  if (!/<html[^>]*\blang="[a-z-]+"/.test(h)) reasons.push('missing lang attribute');
  if (!/<meta\s+name="viewport"/.test(h)) reasons.push('missing viewport meta');
  if (!/<title>[^<]+<\/title>/.test(h)) reasons.push('missing title');
  const sections = (h.match(/<section/g) || []).length;
  if (sections < 5) reasons.push(`only ${sections} <section> elements — not a full site`);
  if (h.length < 15 * 1024) reasons.push(`too small (${Math.round(h.length / 1024)} KB) — luxury bar not met`);
  if (h.length > 200 * 1024) reasons.push(`too large (${Math.round(h.length / 1024)} KB)`);
  const name = String(plan?.siteName || '').trim();
  if (name && !h.includes(name)) reasons.push(`business name "${name}" not present`);
  if (/\beval\s*\(|new\s+Function\s*\(|document\.write\s*\(/.test(h)) reasons.push('unsafe dynamic execution (eval/new Function/document.write)');
  if (/<script[^>]+src=/i.test(h) && ![...h.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].every((m) => ALLOWED_EXTERNAL.test(m[1]))) reasons.push('external <script src> outside the allowlist');
  if (/<link[^>]+href=/i.test(h) && ![...h.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)].every((m) => ALLOWED_EXTERNAL.test(m[1]))) reasons.push('external <link> outside the allowlist');
  if (/sk-[a-z0-9]{16,}/i.test(h)) reasons.push('looks like a hardcoded API key');
  if (reasons.length) throw new Error(`AI site rejected (${reasons.length}): ${reasons.slice(0, 4).join('; ')}`);
  return true;
}

// Attempt an AI-authored single-file site for the plan. Never throws:
// { ok: true, html, provider } | { ok: false, reason }.
export async function tryAiSite(orgId, plan) {
  if (!hasAnyKey(orgId)) return { ok: false, reason: 'no_ai_keys' };
  let res = null;
  try {
    res = await aiChat(orgId, { messages: [{ role: 'user', content: aiSitePrompt(plan) }], maxTokens: 16000 });
  } catch (e) {
    return { ok: false, reason: `ai_call_failed: ${String(e.message || e).slice(0, 140)}` };
  }
  let html = '';
  try {
    html = extractAiSite(res.text);
    validateAiSite(html, plan);
  } catch (e) {
    return { ok: false, reason: `ai_rejected: ${String(e.message || e).slice(0, 180)}` };
  }
  return { ok: true, html, provider: res.provider || 'ai' };
}
