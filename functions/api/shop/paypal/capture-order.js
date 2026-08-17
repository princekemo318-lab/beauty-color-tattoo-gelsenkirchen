// POST /api/shop/paypal/capture-order — verify the capture SERVER-SIDE, then issue vouchers.
import { json } from "../../../_shared/auth.js";
import { isConfigured, captureOrder, getOrder } from "../../../_shared/paypal.js";
import { markPaidAndIssue, loadVouchers } from "../../../_shared/fulfil.js";
import { sendVoucherEmail } from "../../../_shared/email.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB || !isConfigured(env)) return json({ error: "Shop nicht konfiguriert" }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
  const ppId = (data.orderID || "").toString();
  if (!ppId) return json({ error: "orderID fehlt" }, 400);

  const row = await env.DB.prepare("SELECT * FROM orders WHERE paypal_order_id=?").bind(ppId).first();
  if (!row) return json({ error: "Bestellung nicht gefunden" }, 404);

  // Already fulfilled? Return existing vouchers (idempotent, e.g. double-click or webhook first).
  if (row.status === "paid") {
    const vouchers = await loadVouchers(env, row.id);
    return json({ ok: true, vouchers: pub(vouchers), voucherUrl: url(vouchers) });
  }

  // Capture (or detect an already-completed order).
  const cap = await captureOrder(env, ppId);
  let completed = cap.ok && cap.data && cap.data.status === "COMPLETED";

  if (!completed) {
    const alreadyCaptured =
      cap.data && Array.isArray(cap.data.details) &&
      cap.data.details.some((d) => d.issue === "ORDER_ALREADY_CAPTURED");
    if (alreadyCaptured) {
      const chk = await getOrder(env, ppId);
      completed = chk.ok && chk.data && chk.data.status === "COMPLETED";
    }
  }
  if (!completed) {
    return json({ error: "Zahlung nicht abgeschlossen" }, 402);
  }

  // Verify the captured gross amount matches what we stored (anti-tamper).
  const captured = capturedAmount(cap.data);
  if (captured != null && Math.abs(captured - row.amount_total) > 0.01) {
    return json({ error: "Betrag stimmt nicht überein" }, 409);
  }

  const { vouchers, alreadyIssued } = await markPaidAndIssue(env, row);

  if (!alreadyIssued) {
    // Best-effort email — must not break the (already captured) payment.
    try {
      const origin = new URL(request.url).origin;
      await sendVoucherEmail(env, {
        to: row.customer_email, name: row.customer_name,
        order: row, vouchers, origin,
      });
    } catch { /* ignore */ }
  }

  return json({ ok: true, vouchers: pub(vouchers), voucherUrl: url(vouchers) }, 200);
}

function capturedAmount(orderData) {
  try {
    const pu = orderData.purchase_units && orderData.purchase_units[0];
    const cap = pu.payments.captures[0];
    return parseFloat(cap.amount.value);
  } catch { return null; }
}
const pub = (vs) => vs.map((v) => ({ code: v.code, title: v.title, value: v.value }));
const url = (vs) => (vs && vs[0] ? "/voucher/" + vs[0].code : null);
