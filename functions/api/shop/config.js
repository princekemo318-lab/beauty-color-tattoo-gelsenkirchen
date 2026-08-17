// GET /api/shop/config — exposes only the PUBLIC PayPal client-id (safe) + settings.
// The PayPal SECRET is never exposed.
import { json } from "../../_shared/auth.js";
import { SHIPPING, TAX_RATE, CUSTOM_MIN, CURRENCY } from "../../_shared/shop.js";

export async function onRequestGet({ env }) {
  return json({
    paypalClientId: env.PAYPAL_CLIENT_ID || null,
    env: env.PAYPAL_ENV || "sandbox",
    currency: CURRENCY,
    shipping: SHIPPING,
    taxRate: TAX_RATE,
    customMin: CUSTOM_MIN,
  }, 200, { "cache-control": "public, max-age=120" });
}
