// /api/admin/settings — Shop-Einstellungen lesen (nur Status, nie Klartext), speichern
// und optional gegen PayPal/Resend testen. Nur mit gültiger Admin-Session.
import { getIdentity, unauthorized, json } from "../../_shared/auth.js";
import { publicStatus, saveSettings, validate, resolvedEnv } from "../../_shared/settings.js";
import { getAccessToken, isConfigured } from "../../_shared/paypal.js";

export async function onRequestGet({ request, env }) {
  if (!(await getIdentity(request, env))) return unauthorized();
  if (!env.DB) return json({ error: "Keine Datenbank" }, 503);
  return json({ settings: await publicStatus(env) });
}

export async function onRequestPut({ request, env }) {
  if (!(await getIdentity(request, env))) return unauthorized();
  if (!env.DB) return json({ error: "Keine Datenbank" }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }

  const err = validate(body || {});
  if (err) return json({ error: err }, 400);

  try {
    await saveSettings(env, body || {});
  } catch {
    return json({ error: "Speichern fehlgeschlagen" }, 500);
  }
  return json({ ok: true, settings: await publicStatus(env) });
}

// Verbindungstest: prüft mit den GESPEICHERTEN Werten, ob PayPal bzw. Resend antworten.
export async function onRequestPost({ request, env }) {
  if (!(await getIdentity(request, env))) return unauthorized();

  const cfg = await resolvedEnv(env);
  const result = { paypal: null, resend: null };

  if (!isConfigured(cfg)) {
    result.paypal = { ok: false, msg: "Client ID und Secret fehlen noch." };
  } else {
    try {
      await getAccessToken(cfg);
      result.paypal = { ok: true, msg: "Verbindung zu PayPal (" + (cfg.PAYPAL_ENV || "sandbox") + ") erfolgreich." };
    } catch {
      result.paypal = { ok: false, msg: "PayPal lehnt die Zugangsdaten ab — bitte Client ID, Secret und Umgebung prüfen." };
    }
  }

  if (!cfg.RESEND_API_KEY || !cfg.MAIL_FROM) {
    result.resend = { ok: false, msg: "Nicht eingerichtet — der Shop läuft auch ohne E-Mail-Versand." };
  } else {
    try {
      const r = await fetch("https://api.resend.com/domains", {
        headers: { authorization: `Bearer ${cfg.RESEND_API_KEY}` },
      });
      result.resend = r.ok
        ? { ok: true, msg: "Resend-Schlüssel gültig. Absender: " + cfg.MAIL_FROM }
        : { ok: false, msg: "Resend lehnt den Schlüssel ab (Status " + r.status + ")." };
    } catch {
      result.resend = { ok: false, msg: "Resend war nicht erreichbar." };
    }
  }

  return json(result);
}
