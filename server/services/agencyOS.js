// Agency OS services — manual v28 Phase 13: unified communications timeline +
// billing events. The timeline fills itself from the real surfaces (enquiries,
// portal requests, review decisions, outreach delivery, deal stage changes) — no
// synthetic backfill. Billing events are manual records, not a payment processor.
import crypto from 'node:crypto';
import { db, audit } from '../db.js';

export function logComm(orgId, { dealId = null, prospectId = null, channel, direction = 'in', summary }) {
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO comm_log (id, org_id, deal_id, prospect_id, channel, direction, summary)
    VALUES (?,?,?,?,?,?,?)`)
    .run(id, orgId, dealId, prospectId, String(channel || 'system').slice(0, 40), direction === 'out' ? 'out' : 'in', String(summary || '').slice(0, 500));
  return id;
}

export function listTimeline(orgId, { dealId } = {}) {
  return dealId
    ? db.prepare(`SELECT c.*, d.business_name FROM comm_log c LEFT JOIN client_deals d ON d.id = c.deal_id WHERE c.org_id = ? AND c.deal_id = ? ORDER BY c.created_at DESC LIMIT 200`).all(orgId, dealId)
    : db.prepare(`SELECT c.*, d.business_name FROM comm_log c LEFT JOIN client_deals d ON d.id = c.deal_id WHERE c.org_id = ? ORDER BY c.created_at DESC LIMIT 200`).all(orgId);
}

export function addBillingEvent(orgId, dealId, { kind = 'note', amount = 0, currency = 'cad', status = 'recorded', note = '' }, user, ip = '') {
  const deal = db.prepare(`SELECT * FROM client_deals WHERE id = ? AND org_id = ?`).get(dealId, orgId);
  if (!deal) throw Object.assign(new Error('deal not found'), { status: 404 });
  const KINDS = ['invoice_issued', 'payment_received', 'payment_failed', 'note'];
  if (!KINDS.includes(kind)) throw new Error(`kind must be one of: ${KINDS.join(', ')}`);
  const id = crypto.randomUUID();
  const amountCents = Math.round(Number(amount) * 100) || 0;
  db.prepare(`INSERT INTO billing_events (id, org_id, deal_id, kind, amount_cents, currency, status, note, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, orgId, dealId, kind, amountCents, String(currency || 'cad').slice(0, 8), String(status || 'recorded').slice(0, 40), String(note || '').slice(0, 400), user.id);
  logComm(orgId, {
    dealId, channel: 'billing', direction: kind === 'invoice_issued' ? 'out' : 'in',
    summary: `${kind.replaceAll('_', ' ')} — ${(amountCents / 100).toLocaleString('en-CA', { style: 'currency', currency: (currency || 'cad').toUpperCase() })}${note ? ' — ' + note : ''}`,
  });
  audit(orgId, user.id, 'billing.event_added', 'client_deal', dealId, { kind, amountCents }, ip);
  return db.prepare(`SELECT * FROM billing_events WHERE id = ?`).get(id);
}

export function listBillingEvents(orgId, dealId = null) {
  return dealId
    ? db.prepare(`SELECT b.*, d.business_name FROM billing_events b JOIN client_deals d ON d.id = b.deal_id WHERE b.org_id = ? AND b.deal_id = ? ORDER BY b.created_at DESC LIMIT 100`).all(orgId, dealId)
    : db.prepare(`SELECT b.*, d.business_name FROM billing_events b JOIN client_deals d ON d.id = b.deal_id WHERE b.org_id = ? ORDER BY b.created_at DESC LIMIT 100`).all(orgId);
}
