// Real-time agents API — directory (vendored MIT packs), org enablement, and
// streaming chat. All routes authenticated; enable/disable requires member.
import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listAgents, getAgent, divisions, setAgentEnabled } from '../services/agentPacks.js';
import { chat, history, streamReply } from '../services/agentChat.js';

export const agentsRouter = Router();
agentsRouter.use(requireAuth);

agentsRouter.get('/', (req, res) => {
  res.json({
    agents: listAgents(req.user.orgId, { q: req.query.q, pack: req.query.pack, division: req.query.division }),
    divisions: divisions(),
  });
});

agentsRouter.get('/enabled', (req, res) => {
  const enabled = listAgents(req.user.orgId, {}).filter((a) => a.enabled);
  res.json({ agents: enabled });
});

agentsRouter.get('/:id', (req, res) => {
  const a = getAgent(req.params.id);
  if (!a) return res.status(404).json({ error: 'agent not found' });
  res.json({ agent: a });
});

agentsRouter.post('/:id/enable', requireRole('member'), (req, res) => {
  try { res.json(setAgentEnabled(req.user.orgId, req.params.id, req.user.id, true)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

agentsRouter.delete('/:id/enable', requireRole('member'), (req, res) => {
  try { res.json(setAgentEnabled(req.user.orgId, req.params.id, req.user.id, false)); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

agentsRouter.get('/:id/messages', (req, res) => {
  if (!getAgent(req.params.id)) return res.status(404).json({ error: 'agent not found' });
  res.json({ messages: history(req.user.orgId, req.params.id, req.user.id, Math.min(Number(req.query.limit) || 50, 100)) });
});

// Non-streaming chat round-trip (also used by tests).
agentsRouter.post('/:id/chat', (req, res) => {
  try {
    res.json(chat({ orgId: req.user.orgId, userId: req.user.id, agentId: req.params.id, message: req.body?.message, context: req.body?.context || {} }));
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

// Real-time SSE stream (EventSource-friendly GET).
agentsRouter.get('/:id/chat', (req, res) => {
  let result;
  try {
    result = chat({ orgId: req.user.orgId, userId: req.user.id, agentId: req.params.id, message: req.query.message, context: { page: req.query.page, projectId: req.query.projectId, prospectId: req.query.prospectId, scanId: req.query.scanId } });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(`event: meta\ndata: ${JSON.stringify({ agent: result.agent, sovereign: result.sovereign, contextFacts: result.contextFacts })}\n\n`);
  (async () => {
    try {
      for await (const chunk of streamReply(result.reply)) {
        res.write(`event: token\ndata: ${JSON.stringify({ t: chunk })}\n\n`);
      }
      res.write(`event: done\ndata: ${JSON.stringify({ replyId: result.replyId, reply: result.reply })}\n\n`);
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: e.message })}\n\n`);
    }
    res.end();
  })();
});
