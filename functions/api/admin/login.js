// POST /api/admin/login  { user, password }  → setzt das signierte Session-Cookie.
import { json, checkPassword, createSessionCookie, loginConfigured, adminUser } from "../../_shared/auth.js";

export async function onRequestPost({ request, env }) {
  if (!loginConfigured(env)) {
    return json({ error: "Der Login ist serverseitig noch nicht eingerichtet (Secret ADMIN_PASSWORD fehlt)." }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }

  if (!checkPassword(env, body && body.user, body && body.password)) {
    // Bremse gegen Durchprobieren (das Passwort ist zusätzlich lang und zufällig).
    await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 300)));
    return json({ error: "Benutzername oder Passwort ist falsch." }, 401);
  }

  const cookie = await createSessionCookie(env, new URL(request.url));
  if (!cookie) return json({ error: "Session konnte nicht erstellt werden." }, 500);
  return json({ ok: true, user: adminUser(env) }, 200, { "set-cookie": cookie });
}

export function onRequest() {
  return json({ error: "Methode nicht erlaubt" }, 405);
}
