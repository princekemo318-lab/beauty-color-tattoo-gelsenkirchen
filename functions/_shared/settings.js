// Shop-Einstellungen (PayPal + Resend), im Admin pflegbar.
//
// Ablage: D1-Tabelle `settings`. Geheime Werte liegen dort NICHT im Klartext, sondern
// AES-GCM-verschlüsselt; der Schlüssel steckt im Pages-Secret SETTINGS_KEY (ersatzweise
// ADMIN_PASSWORD) und damit außerhalb der Datenbank. Wer nur die D1 in die Hand bekommt,
// hat die Zugangsdaten trotzdem nicht.
//
// Ausgeliefert wird nie ein geheimer Wert: Das Admin-UI bekommt ausschließlich
// "gesetzt / nicht gesetzt" plus die letzten vier Zeichen.
//
// Vorrang: Werte aus dem Admin gewinnen gegenüber gleichnamigen Umgebungsvariablen —
// so kann die Inhaberin alles selbst ändern, ohne Code oder Deployment anzufassen.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const FIELDS = {
  PAYPAL_CLIENT_ID:  { secret: false, label: "PayPal Client ID" },
  PAYPAL_SECRET:     { secret: true,  label: "PayPal Secret" },
  PAYPAL_WEBHOOK_ID: { secret: true,  label: "PayPal Webhook ID" },
  PAYPAL_ENV:        { secret: false, label: "PayPal Umgebung" },
  RESEND_API_KEY:    { secret: true,  label: "Resend API Key" },
  MAIL_FROM:         { secret: false, label: "Absender-E-Mail" },
};

const b64url = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64url = (s) => {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4; if (pad) s += "=".repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function aesKey(env) {
  const material = env.SETTINGS_KEY || env.ADMIN_PASSWORD;
  if (!material) return null;
  const digest = await crypto.subtle.digest("SHA-256", enc.encode("bct-settings-v1:" + material));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encrypt(env, plain) {
  const key = await aesKey(env);
  if (!key) return "raw:" + plain;                       // kein Schlüssel vorhanden
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return "enc:v1:" + b64url(iv) + ":" + b64url(new Uint8Array(ct));
}

async function decrypt(env, stored) {
  if (typeof stored !== "string") return null;
  if (stored.startsWith("raw:")) return stored.slice(4);
  if (!stored.startsWith("enc:v1:")) return stored;      // Altbestand
  const parts = stored.split(":");
  const key = await aesKey(env);
  if (!key || parts.length !== 4) return null;
  try {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64url(parts[2]) }, key, unb64url(parts[3])
    );
    return dec.decode(pt);
  } catch { return null; }
}

/** Alle gespeicherten Werte im Klartext — NUR serverseitig verwenden. */
export async function loadSettings(env) {
  if (!env.DB) return {};
  let rows;
  try {
    const r = await env.DB.prepare("SELECT key, value FROM settings").all();
    rows = r.results || [];
  } catch { return {}; }

  const out = {};
  for (const row of rows) {
    if (!(row.key in FIELDS)) continue;
    const v = await decrypt(env, row.value);
    if (v) out[row.key] = v;
  }
  return out;
}

/**
 * env + gespeicherte Einstellungen. Die bestehende PayPal-/Mail-Logik bekommt dieses
 * Objekt anstelle von env und bleibt dadurch unverändert.
 */
export async function resolvedEnv(env) {
  const s = await loadSettings(env);
  const merged = { ...env };
  for (const [k, v] of Object.entries(s)) if (v) merged[k] = v;
  return merged;
}

export async function saveSettings(env, values) {
  if (!env.DB) throw new Error("Keine Datenbank");
  const now = new Date().toISOString();
  for (const [key, raw] of Object.entries(values)) {
    if (!(key in FIELDS)) continue;
    const val = typeof raw === "string" ? raw.trim() : "";
    if (val === "") {
      await env.DB.prepare("DELETE FROM settings WHERE key=?").bind(key).run();
      continue;
    }
    const stored = FIELDS[key].secret ? await encrypt(env, val) : "raw:" + val;
    await env.DB.prepare(
      "INSERT INTO settings (key, value, is_secret, updated_at) VALUES (?,?,?,?) " +
      "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at"
    ).bind(key, stored, FIELDS[key].secret ? 1 : 0, now).run();
  }
}

/** Für das Admin-UI: niemals ein Geheimnis im Klartext. */
export async function publicStatus(env) {
  const s = await loadSettings(env);
  const out = {};
  for (const [key, meta] of Object.entries(FIELDS)) {
    const fromDb = s[key];
    const fromEnv = !fromDb && env[key] ? String(env[key]) : null;
    const value = fromDb || fromEnv || "";
    out[key] = {
      label: meta.label,
      set: !!value,
      source: fromDb ? "admin" : (fromEnv ? "env" : null),
      preview: !value ? "" : (meta.secret ? "••••••••" + value.slice(-4) : value),
    };
  }
  out._encrypted = !!(env.SETTINGS_KEY || env.ADMIN_PASSWORD);
  return out;
}

/** Serverseitige Prüfung der Eingaben. Liefert einen Fehlertext oder null. */
export function validate(values) {
  const v = (k) => (typeof values[k] === "string" ? values[k].trim() : "");

  if (values.PAYPAL_ENV !== undefined && v("PAYPAL_ENV") &&
      !["live", "sandbox"].includes(v("PAYPAL_ENV"))) {
    return "PayPal Umgebung muss „live“ oder „sandbox“ sein.";
  }
  if (v("PAYPAL_CLIENT_ID") && v("PAYPAL_CLIENT_ID").length < 20) {
    return "Die PayPal Client ID sieht zu kurz aus.";
  }
  if (v("PAYPAL_SECRET") && v("PAYPAL_SECRET").length < 20) {
    return "Das PayPal Secret sieht zu kurz aus.";
  }
  if (v("RESEND_API_KEY") && !/^re_[A-Za-z0-9_-]{10,}$/.test(v("RESEND_API_KEY"))) {
    return "Ein Resend API Key beginnt mit „re_“.";
  }
  if (v("MAIL_FROM") && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v("MAIL_FROM"))) {
    return "Bitte eine gültige Absender-E-Mail angeben.";
  }
  return null;
}
