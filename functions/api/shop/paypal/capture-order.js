// POST /api/shop/paypal/capture-order — verify the capture SERVER-SIDE, then issue vouchers.
import { json } from "../../../_shared/auth.js";
import { isConfigured, captureOrder, getOrder } from "../../../_shared/paypal.js";
import { markPaidAndIssue, loadVouchers } from "../../../_shared/fulfil.js";
import { sendVoucherEmail, mailProvider } from "../../../_shared/email.js";
import { resolvedEnv } from "../../../_shared/settings.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Shop nicht konfiguriert" }, 503);
  const cfg = await resolvedEnv(env);   // Admin-Einstellungen haben Vorrang
  if (!isConfigured(cfg)) return json({ error: "Shop nicht konfiguriert" }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
  const ppId = (data.orderID || "").toString();
  if (!ppId) return json({ error: "orderID fehlt" }, 400);

  const row = await env.DB.prepare("SELECT * FROM orders WHERE paypal_order_id=?").bind(ppId).first();
  if (!row) return json({ error: "Bestellung nicht gefunden" }, 404);

  // Already fulfilled? Return existing vouchers (idempotent, e.g. double-click or webhook first).
  if (row.status === "paid") {
    const vouchers = await loadVouchers(env, row.id);
    return json({ ok: true, vouchers: pub(vouchers), voucherUrl: url(vouchers), emailed: !!mailProvider(cfg) });
  }

  // Capture (or detect an already-completed order).
  const cap = await captureOrder(cfg, ppId);
  let completed = cap.ok && cap.data && cap.data.status === "COMPLETED";

  if (!completed) {
    const alreadyCaptured =
      cap.data && Array.isArray(cap.data.details) &&
      cap.data.details.some((d) => d.issue === "ORDER_ALREADY_CAPTURED");
    if (alreadyCaptured) {
      const chk = await getOrder(cfg, ppId);
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

  let emailed = false;
  if (!alreadyIssued) {
    // Best-effort E-Mail — darf die bereits erfolgte Zahlung nie kippen.
    try {
      const origin = new URL(request.url).origin;
      const mail = await sendVoucherEmail(cfg, {
        to: row.customer_email, name: row.customer_name,
        order: row, vouchers, origin,
      });
      emailed = !!(mail && mail.sent);
    } catch { /* egal */ }
  } else {
    emailed = !!mailProvider(cfg);
  }

  return json({ ok: true, vouchers: pub(vouchers), voucherUrl: url(vouchers), emailed }, 200);
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
