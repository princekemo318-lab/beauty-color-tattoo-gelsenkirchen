// PayPal REST helper (server-side only). Secrets come from env and NEVER reach the client.
// Required env: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID, PAYPAL_ENV ("live"|"sandbox").

export function apiBase(env) {
  const mode = env.PAYPAL_ENV || "sandbox";
  // NUR fuer lokale Tests: PAYPAL_ENV="mock" + PAYPAL_MOCK_BASE zeigt auf einen lokalen
  // Nachbau der PayPal-API. In Produktion steht PAYPAL_ENV auf "live" bzw. "sandbox",
  // damit ist dieser Zweig dort unerreichbar.
  if (mode === "mock" && env.PAYPAL_MOCK_BASE) return env.PAYPAL_MOCK_BASE;
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function isConfigured(env) {
  return !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET);
}

export async function getAccessToken(env) {
  const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const res = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal auth failed");
  return (await res.json()).access_token;
}

// order: computed by _shared/shop.js (server-authoritative amounts)
export async function createOrder(env, order, opts) {
  const token = await getAccessToken(env);
  const body = {
    intent: "CAPTURE",
    purchase_units: [{
      reference_id: "default",
      description: (opts && opts.description) ? opts.description.slice(0, 127) : "Beauty & Color Gutschein",
      custom_id: (opts && opts.customId) ? String(opts.customId).slice(0, 127) : undefined,
      amount: {
        currency_code: order.currency,
        value: order.total.toFixed(2),
        breakdown: {
          item_total: { currency_code: order.currency, value: order.subtotal.toFixed(2) },
          shipping:   { currency_code: order.currency, value: order.shipping.toFixed(2) },
        },
      },
      items: order.lines.map((l) => ({
        name: l.title.slice(0, 127),
        quantity: String(l.qty),
        unit_amount: { currency_code: order.currency, value: l.unit.toFixed(2) },
      })),
    }],
    application_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", brand_name: "Beauty & Color Tattoo" },
  };
  const res = await fetch(`${apiBase(env)}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("PayPal create failed: " + (data.message || res.status));
  return data; // { id, status, ... }
}

export async function captureOrder(env, paypalOrderId) {
  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export async function getOrder(env, paypalOrderId) {
  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { ok: res.ok, data: await res.json() };
}

// Verify webhook authenticity server-side (never trust the raw event alone).
export async function verifyWebhook(env, headers, rawBody) {
  const token = await getAccessToken(env);
  const payload = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: env.PAYPAL_WEBHOOK_ID,
    webhook_event: JSON.parse(rawBody),
  };
  const res = await fetch(`${apiBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return false;
  return (await res.json()).verification_status === "SUCCESS";
}
