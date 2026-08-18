// POST /api/shop/paypal/webhook — signature-verified server-side safety net.
// Ensures vouchers exist even if the browser closed before capture-order returned.
import { verifyWebhook } from "../../../_shared/paypal.js";
import { markPaidAndIssue } from "../../../_shared/fulfil.js";
import { sendVoucherEmail } from "../../../_shared/email.js";
import { resolvedEnv } from "../../../_shared/settings.js";

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const cfg = await resolvedEnv(env);   // Admin-Einstellungen haben Vorrang

  // Never trust the event without verifying its signature with PayPal.
  let valid = false;
  try { valid = await verifyWebhook(cfg, request.headers, raw); } catch { valid = false; }
  if (!valid) return new Response("invalid signature", { status: 401 });

  let event;
  try { event = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  const type = event.event_type;
  const relevant = type === "PAYMENT.CAPTURE.COMPLETED" || type === "CHECKOUT.ORDER.COMPLETED";
  if (!relevant || !env.DB) return new Response("ignored", { status: 200 });

  // custom_id carries our internal order id (set at create-order time).
  const res = event.resource || {};
  const customId =
    res.custom_id ||
    (res.purchase_units && res.purchase_units[0] && res.purchase_units[0].custom_id);

  let row = null;
  if (customId) row = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(parseInt(customId, 10)).first();
  if (!row) {
    const ppOrderId = res.supplementary_data && res.supplementary_data.related_ids && res.supplementary_data.related_ids.order_id;
    if (ppOrderId) row = await env.DB.prepare("SELECT * FROM orders WHERE paypal_order_id=?").bind(ppOrderId).first();
  }
  if (!row) return new Response("order not found", { status: 200 });

  const { vouchers, alreadyIssued } = await markPaidAndIssue(env, row);
  if (!alreadyIssued) {
    try {
      const origin = new URL(request.url).origin;
      await sendVoucherEmail(cfg, { to: row.customer_email, name: row.customer_name, order: row, vouchers, origin });
    } catch { /* ignore */ }
  }
  return new Response("ok", { status: 200 });
}
