import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { audit } from '../db.js';
import { chat, gatewayStatus, listProviders, setProviderEnabled } from '../services/modelGateway.js';

export const gatewayRouter = Router();

gatewayRouter.get('/status', (req, res) => res.json(gatewayStatus()));

gatewayRouter.use(requireAuth);

gatewayRouter.get('/providers', (req, res) => res.json({ providers: listProviders() }));

// Enabling an EXTERNAL provider requires admin and is audited (manual §9 approval-gated actions)
gatewayRouter.post('/providers/:id/toggle', requireRole('admin'), (req, res) => {
  const { enabled } = req.body || {};
  try {
    const p = setProviderEnabled(req.params.id, Boolean(enabled), req.user);
    audit(req.user.orgId, req.user.id, 'gateway.provider.toggle', 'provider', p.id, { enabled: p.enabled }, req.ip);
    res.json({ provider: p });
  } catch (e) {
    res.status(404).json({ error: 'provider not found' });
  }
});

gatewayRouter.post('/chat', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
  // Real multi-AI when the org has configured BYOK keys; sovereign engine otherwise.
  try {
    const { aiChat } = await import('../services/multiAi.js');
    res.json(await aiChat(req.user.orgId, { messages: messages.slice(0, 40) }));
  } catch (e) {
    if (e.code === 'NO_AI_KEYS' || e.code === 'ALL_AI_FAILED') return res.json(chat(messages));
    res.status(400).json({ error: String(e.message || e) });
  }
});
