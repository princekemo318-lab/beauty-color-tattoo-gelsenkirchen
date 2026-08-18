// POST /api/shop/paypal/create-order — amount computed SERVER-SIDE, never from client.
import { json } from "../../../_shared/auth.js";
import { computeOrder, validEmail } from "../../../_shared/shop.js";
import { isConfigured, createOrder } from "../../../_shared/paypal.js";
import { resolvedEnv } from "../../../_shared/settings.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Shop nicht konfiguriert" }, 503);
  const cfg = await resolvedEnv(env);   // Admin-Einstellungen haben Vorrang vor Umgebungsvariablen
  if (!isConfigured(cfg)) return json({ error: "Zahlung noch nicht eingerichtet" }, 503);

  let data;
  try { data = await request.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }

  const email = (data.email || "").toString().trim();
  const name = (data.name || "").toString().trim().slice(0, 120) || null;
  if (!validEmail(email)) return json({ error: "Bitte eine gültige E-Mail-Adresse angeben" }, 400);

  const order = computeOrder(data.items);
  if (order.error) return json({ error: order.error }, 400);

  const now = new Date().toISOString();
  // 1) Persist a pending order first so we own a stable internal id (used as PayPal custom_id).
  const ins = await env.DB.prepare(
    `INSERT INTO orders (customer_email, customer_name, items_json, amount_total, amount_shipping,
       amount_net, amount_tax, currency, status, created_at)
     VALUES (?,?,?,?,?,?,?,?, 'created', ?)`
  ).bind(email, name, JSON.stringify(order.lines), order.total, order.shipping,
         order.net, order.tax, order.currency, now).run();
  const internalId = ins.meta.last_row_id;

  // 2) Create the PayPal order for exactly this amount.
  let pp;
  try {
    pp = await createOrder(cfg, order, {
      description: "Beauty & Color Gutschein",
      customId: String(internalId),
    });
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status='failed' WHERE id=?").bind(internalId).run();
    return json({ error: "PayPal konnte die Bestellung nicht anlegen" }, 502);
  }

  // 3) Link PayPal order id to our row.
  await env.DB.prepare("UPDATE orders SET paypal_order_id=? WHERE id=?").bind(pp.id, internalId).run();

  return json({ id: pp.id, total: order.total, currency: order.currency }, 201);
}
