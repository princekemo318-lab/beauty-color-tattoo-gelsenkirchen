// GET /api/shop/orders — admin only: orders + their vouchers.
import { getIdentity, unauthorized, json } from "../../_shared/auth.js";

export async function onRequestGet({ request, env }) {
  const id = await getIdentity(request, env);
  if (!id) return unauthorized();
  if (!env.DB) return json({ orders: [] });

  const { results: orders } = await env.DB.prepare(
    "SELECT id, paypal_order_id, customer_email, customer_name, amount_total, amount_tax, currency, status, created_at, paid_at FROM orders ORDER BY created_at DESC LIMIT 300"
  ).all();
  const { results: vouchers } = await env.DB.prepare(
    "SELECT id, order_id, code, kind, title, value, status, created_at, redeemed_at FROM vouchers ORDER BY id DESC"
  ).all();

  const byOrder = {};
  (vouchers || []).forEach((v) => { (byOrder[v.order_id] = byOrder[v.order_id] || []).push(v); });

  return json({
    orders: (orders || []).map((o) => ({ ...o, vouchers: byOrder[o.id] || [] })),
  });
}
