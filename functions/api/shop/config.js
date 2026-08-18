// GET /api/shop/config — exposes only the PUBLIC PayPal client-id (safe) + settings.
// The PayPal SECRET is never exposed.
import { json } from "../../_shared/auth.js";
import { SHIPPING, TAX_RATE, CUSTOM_MIN, CURRENCY } from "../../_shared/shop.js";
import { resolvedEnv } from "../../_shared/settings.js";

export async function onRequestGet({ env }) {
  const cfg = await resolvedEnv(env);
  return json({
    paypalClientId: cfg.PAYPAL_CLIENT_ID || null,
    env: cfg.PAYPAL_ENV || "sandbox",
    currency: CURRENCY,
    shipping: SHIPPING,
    taxRate: TAX_RATE,
    customMin: CUSTOM_MIN,
  }, 200, { "cache-control": "no-store" });
}
