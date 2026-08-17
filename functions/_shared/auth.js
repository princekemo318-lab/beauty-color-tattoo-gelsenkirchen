// Server-side Cloudflare Access verification (RS256 JWT).
// Files/dirs starting with "_" are NOT routed by Pages Functions — safe for shared code.

let JWKS_CACHE = { url: null, keys: null, exp: 0 };

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(teamDomain) {
  const host = teamDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = `https://${host}/cdn-cgi/access/certs`;
  const now = Date.now();
  if (JWKS_CACHE.url === url && JWKS_CACHE.keys && JWKS_CACHE.exp > now) return JWKS_CACHE.keys;
  const res = await fetch(url, { cf: { cacheTtl: 3600 } });
  if (!res.ok) throw new Error("JWKS fetch failed");
  const data = await res.json();
  JWKS_CACHE = { url, keys: data.keys || [], exp: now + 3600_000 };
  return JWKS_CACHE.keys;
}

/**
 * Returns { email } when the request carries a valid Cloudflare Access JWT for
 * this application, otherwise null. NEVER trust the presence of /admin alone —
 * every write endpoint calls this.
 */
export async function getIdentity(request, env) {
  // Local-dev bypass. Set ACCESS_DEV_EMAIL only in `wrangler pages dev`, never in prod.
  if (env.ACCESS_DEV_EMAIL) return { email: env.ACCESS_DEV_EMAIL, dev: true };

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return null;

  const cookie = request.headers.get("Cookie") || "";
  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ||
    (cookie.match(/CF_Authorization=([^;]+)/) || [])[1];
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header, payload;
  try {
    header = b64urlToJson(parts[0]);
    payload = b64urlToJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;

  let keys;
  try { keys = await getKeys(env.ACCESS_TEAM_DOMAIN); } catch { return null; }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const data = new TextEncoder().encode(parts[0] + "." + parts[1]);
    ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), data);
  } catch { return null; }
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;

  if (env.OWNER_EMAIL) {
    const allowed = env.OWNER_EMAIL.split(",").map((s) => s.trim().toLowerCase());
    if (!allowed.includes((payload.email || "").toLowerCase())) return null;
  }
  return { email: payload.email };
}

export function unauthorized() {
  return json({ error: "Unauthorized" }, 401);
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}
