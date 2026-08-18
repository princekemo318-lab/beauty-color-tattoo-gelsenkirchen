// Eigener Admin-Login — KEIN Cloudflare Access, kein OAuth, kein Zero Trust.
//
// Prinzip: Benutzername + Passwort werden serverseitig gegen die Pages-Variablen
// ADMIN_USER (öffentlich) und ADMIN_PASSWORD (Secret) geprüft. Danach bekommt der
// Browser ein signiertes Session-Cookie (HMAC-SHA256). Das Cookie enthält KEIN
// Passwort — nur Ablaufzeit + Zufallswert + Signatur. Ohne den Secret-Schlüssel
// lässt es sich nicht fälschen.
//
// Das Passwort steht ausschließlich serverseitig (Secret) — nie im Frontend,
// nie im Repository.
//
// Dateien/Ordner mit "_" werden von Pages Functions NICHT geroutet → sicher für Shared-Code.

const COOKIE_NAME = "bct_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 Tage eingeloggt bleiben

const enc = (s) => new TextEncoder().encode(s);

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Konstante Laufzeit — verhindert, dass sich das Passwort zeichenweise erraten lässt. */
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const A = enc(a), B = enc(b);
  let diff = A.length ^ B.length;
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) diff |= (A[i] || 0) ^ (B[i] || 0);
  return diff === 0;
}

/** Signaturschlüssel. Standard: aus dem Admin-Passwort abgeleitet — dann genügt EIN Secret.
 *  Passwortwechsel macht damit automatisch alle alten Sessions ungültig. */
async function signingKey(env) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
  if (!secret) return null;
  return crypto.subtle.importKey(
    "raw", enc("bct-admin-session-v1:" + secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
}

async function sign(env, data) {
  const key = await signingKey(env);
  if (!key) return null;
  return bytesToB64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(data))));
}

export function adminUser(env) {
  return String(env.ADMIN_USER || "nicole").trim();
}

/** true, sobald ADMIN_PASSWORD gesetzt ist (sonst ist der Login gar nicht scharf). */
export function loginConfigured(env) {
  return typeof env.ADMIN_PASSWORD === "string" && env.ADMIN_PASSWORD.length >= 8;
}

export function checkPassword(env, user, password) {
  if (!loginConfigured(env)) return false;
  const okUser = timingSafeEqual(String(user || "").trim().toLowerCase(), adminUser(env).toLowerCase());
  const okPass = timingSafeEqual(String(password || ""), String(env.ADMIN_PASSWORD));
  return okUser && okPass; // beide immer auswerten, kein Kurzschluss
}

function cookieHeader(value, maxAge, url) {
  const secure = !url || url.protocol === "https:"; // lokal (http) sonst unsetzbar
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` +
         (secure ? "; Secure" : "");
}

export async function createSessionCookie(env, url) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const nonce = bytesToB64url(crypto.getRandomValues(new Uint8Array(12)));
  const data = `v1.${exp}.${nonce}`;
  const sig = await sign(env, data);
  if (!sig) return null;
  return cookieHeader(`${data}.${sig}`, MAX_AGE, url);
}

export function clearSessionCookie(url) {
  return cookieHeader("", 0, url);
}

/**
 * Liefert { user }, wenn die Anfrage ein gültiges, nicht abgelaufenes Session-Cookie
 * trägt — sonst null. JEDER schreibende Endpunkt ruft das auf; es reicht ausdrücklich
 * NICHT, nur die /admin-Seite abzusichern.
 */
export async function getIdentity(request, env) {
  if (!loginConfigured(env)) return null;

  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)bct_session=([^;]+)/);
  if (!m) return null;

  const parts = m[1].split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [v, exp, nonce, sig] = parts;

  const expected = await sign(env, `${v}.${exp}.${nonce}`);
  if (!expected || !timingSafeEqual(sig, expected)) return null;

  const expNum = parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum <= Math.floor(Date.now() / 1000)) return null;

  return { user: adminUser(env) };
}

export function unauthorized() {
  return json({ error: "Nicht angemeldet" }, 401);
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
