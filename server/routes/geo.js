import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { geocodeLocation } from '../services/geo.js';

export const geoRouter = Router();
geoRouter.use(requireAuth);

// Keyless live geocoding for map UI (Builder map panel, location pickers).
// Returns { query, geo } where geo is { lat, lng, displayName } or null when
// the lookup misses — callers degrade gracefully, nothing breaks offline.
geoRouter.get('/lookup', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'q is required (min 2 chars)' });
  const country = String(req.query.country || '').trim();
  const geo = await geocodeLocation(q, { countrycodes: country.slice(0, 20) });
  res.json({ query: q.slice(0, 200), geo });
});
