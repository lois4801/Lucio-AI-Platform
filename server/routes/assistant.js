import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { assistantContext, assistantChat, dismissTip, squadAgents, squadProvenance } from '../services/assistant/engine.js';

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

// Always-on assistance context: current agent persona, proactive tips, journey checklist.
assistantRouter.get('/context', (req, res) => {
  const route = String(req.query.route || '/dashboard');
  res.json(assistantContext(req.user.orgId, req.user, route));
});

// Conversational assistance (sovereign engine — no external model required).
assistantRouter.post('/chat', (req, res) => {
  const { message, route } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });
  res.json(assistantChat(req.user.orgId, req.user, { message, route }));
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
