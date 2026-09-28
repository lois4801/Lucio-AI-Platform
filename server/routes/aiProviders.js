// Multi-AI API — BYOK key management, verification, unified chat (fallback
// chain) and the all-providers-at-once council.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { upsertKey, listKeys, deleteKey, setKeyEnabled, hasAnyKey } from '../services/aiVault.js';
import { aiChat, aiCouncil, verifyKey, discoverModels, modelsFor } from '../services/multiAi.js';
import { chat as sovereignChat } from '../services/modelGateway.js';

export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/providers', (req, res) => {
  const out = listKeys(req.user.orgId);
  // Merge each key with its model catalog: provider-discovered entries (when a
  // refresh has run) over the static manifest — no stale-only dropdowns.
  out.keys = out.keys.map((k) => ({ ...k, availableModels: modelsFor(req.user.orgId, k.provider) }));
  res.json(out);
});

// Dynamic model discovery (spec §CRITICAL): retrieves the provider's live
// catalog and persists it for this tenant. Falls back to the static manifest
// with degraded=true when the provider/discovery fails — never fakes success.
aiRouter.post('/providers/:provider/discover', requireRole('member'), async (req, res) => {
  try { res.json(await discoverModels(req.user.orgId, req.params.provider)); }
  catch (e) { res.status(e.status || 400).json({ error: String(e.message || e) }); }
});

aiRouter.put('/providers/keys', requireRole('member'), (req, res) => {
  try {
    const key = upsertKey(req.user.orgId, req.user, req.body || {}, req.ip);
    res.status(200).json({ key });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

aiRouter.delete('/providers/keys/:provider', requireRole('member'), (req, res) => {
  const okDel = deleteKey(req.user.orgId, req.user, req.params.provider, req.ip);
  if (!okDel) return res.status(404).json({ error: 'key not found' });
  res.json({ ok: true });
});

aiRouter.post('/providers/:provider/toggle', requireRole('member'), (req, res) => {
  const key = setKeyEnabled(req.user.orgId, req.user, req.params.provider, Boolean(req.body?.enabled), req.ip);
  if (!key) return res.status(404).json({ error: 'key not found' });
  res.json({ key });
});

aiRouter.post('/providers/:provider/verify', requireRole('member'), async (req, res) => {
  try { res.json(await verifyKey(req.user.orgId, req.params.provider)); }
  catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

// Unified chat — real AI when keys are configured, sovereign engine otherwise.
aiRouter.post('/chat', async (req, res) => {
  const { messages, maxTokens, purpose } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'messages array required' });
  try {
    const out = await aiChat(req.user.orgId, { messages: messages.slice(0, 40), maxTokens, purpose });
    res.json(out);
  } catch (e) {
    if (e.code === 'NO_AI_KEYS') return res.json({ ...sovereignChat(messages), sovereign: true });
    if (e.code === 'ALL_AI_FAILED') return res.status(502).json({ error: e.message, errors: e.errors });
    res.status(400).json({ error: String(e.message || e) });
  }
});

// Every configured AI answers the same prompt, in parallel.
aiRouter.post('/council', async (req, res) => {
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (!hasAnyKey(req.user.orgId)) return res.status(400).json({ error: 'no AI providers configured — add keys below first' });
  try {
    res.json({ answers: await aiCouncil(req.user.orgId, { prompt, maxTokens: req.body?.maxTokens }) });
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});
