// Serverseitiger Schutz für /admin: ohne gültige Session wird das Admin-UI gar nicht
// ausgeliefert — stattdessen kommt die Login-Seite. Die API-Endpunkte prüfen die Session
// zusätzlich selbst (siehe _shared/auth.js) — dieser Schutz allein wäre nicht genug.
import { getIdentity, loginConfigured } from "../_shared/auth.js";
import { loginPage } from "../_shared/loginpage.js";

export async function onRequest(context) {
  const { request, env, next } = context;

  const identity = await getIdentity(request, env);
  if (identity) {
    const res = await next();
    const out = new Response(res.body, res);
    out.headers.set("cache-control", "no-store");
    out.headers.set("x-robots-tag", "noindex, nofollow");
    return out;
  }

  return new Response(loginPage({ configured: loginConfigured(env) }), {
    status: 401,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
