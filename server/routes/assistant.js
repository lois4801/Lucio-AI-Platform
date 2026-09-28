import { liveAssistantChat, chatError } from '../services/assistant/liveChat.js';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { assistantContext, dismissTip, squadAgents, squadProvenance } from '../services/assistant/engine.js';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

// Always-on assistance context: current agent persona, proactive tips, journey checklist.
assistantRouter.get('/context', (req, res) => {
  const route = String(req.query.route || '/dashboard');
  res.json(assistantContext(req.user.orgId, req.user, route));
});

// Conversational requests use the configured model gateway; guidance stays local.
assistantRouter.post('/chat', async (req, res) => {
  try { res.json(await liveAssistantChat(req.user.orgId, req.user, req.body || {})); }
  catch (e) { const failure = chatError(e); res.status(failure.status).json(failure); }
});

assistantRouter.post('/dismiss', (req, res) => {
  const { tipKey } = req.body || {};
  if (!tipKey) return res.status(400).json({ error: 'tipKey is required' });
  res.json(dismissTip(req.user.id, String(tipKey)));
});

// Embedded squad + provenance (verbatim from the v9.6 unified registry).
assistantRouter.get('/squad', (req, res) => {
  res.json({ provenance: squadProvenance(), agents: squadAgents() });
});
