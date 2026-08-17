// GET /voucher/:code — branded, self-contained voucher page (digitaler Gutschein).
// Code in the URL is the unguessable access token.
const CODE_RE = /^BC-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export async function onRequestGet({ params, env }) {
  const code = String(params.code || "").toUpperCase();
  const notFound = () => new Response(page(null), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  if (!CODE_RE.test(code) || !env.DB) return notFound();

  const v = await env.DB.prepare(
    "SELECT code, kind, title, value, status, created_at FROM vouchers WHERE code=?"
  ).bind(code).first();
  if (!v) return notFound();

  return new Response(page(v), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

function page(v) {
  const date = v && v.created_at ? new Date(v.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : "";
  const statusLabel = v ? ({ active: "Gültig", redeemed: "Eingelöst", cancelled: "Storniert", expired: "Abgelaufen" }[v.status] || v.status) : "";
  const inner = !v
    ? `<h1>Gutschein nicht gefunden</h1><p>Der Code ist ungültig oder wurde entfernt.</p><a class="btn" href="/">Zur Startseite</a>`
    : `
      <span class="eyebrow">Geschenkgutschein</span>
      <div class="value">${esc(Number(v.value).toFixed(2))}&nbsp;€</div>
      <div class="title">${esc(v.title)}</div>
      <div class="code">${esc(v.code)}</div>
      <div class="status status--${esc(v.status)}">${esc(statusLabel)}</div>
      <dl class="meta">
        <div><dt>Ausgestellt</dt><dd>${esc(date)}</dd></div>
        <div><dt>Einlösbar</dt><dd>Im Studio · De-la-Chevallerie-Str. 32, Gelsenkirchen</dd></div>
      </dl>
      <p class="note">Bitte diesen Code beim Besuch im Studio vorzeigen. Fragen? WhatsApp 0176&nbsp;84962255.</p>
      <a class="btn" href="/">beautyandcolor · zur Website</a>`;

  return `<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0a090c">
<title>Gutschein — Beauty &amp; Color Tattoo</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="stylesheet" href="/assets/css/fonts.css">
<style>
:root{--gold-grad:linear-gradient(102deg,#8a6530,#e7c880 40%,#b07d3f 60%,#f0d492 84%)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Inter",system-ui,sans-serif;background:#0a090c;color:#ece3d3;min-height:100svh;
  display:grid;place-items:center;padding:24px;-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;
  background:radial-gradient(120% 80% at 50% 0%,rgba(120,86,44,.18),transparent 60%)}
.card{position:relative;z-index:1;max-width:460px;width:100%;text-align:center;
  border:1px solid rgba(201,159,86,.35);border-radius:22px;padding:clamp(28px,7vw,44px);
  background:linear-gradient(180deg,#16131a,#100e13);box-shadow:0 40px 90px -40px #000}
.brand{font-family:"Fraunces",Georgia,serif;font-size:1.3rem;margin-bottom:.2rem}
.brand em{font-style:italic;background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-size:.6rem;letter-spacing:.28em;text-transform:uppercase;color:#8f8676;margin-bottom:1.6rem}
.eyebrow{font-size:.66rem;letter-spacing:.24em;text-transform:uppercase;color:#c99f56}
.value{font-family:"Fraunces",Georgia,serif;font-size:clamp(3rem,14vw,4.5rem);line-height:1;margin:.4rem 0;
  background:var(--gold-grad);-webkit-background-clip:text;background-clip:text;color:transparent}
.title{font-family:"Fraunces",Georgia,serif;font-size:1.3rem;color:#ece3d3;margin-bottom:1.4rem}
.code{font-family:"Fraunces",Georgia,serif;letter-spacing:.14em;font-size:1.5rem;color:#e7c880;
  border:1px dashed rgba(201,159,86,.5);border-radius:12px;padding:.6rem 1rem;display:inline-block;margin-bottom:1rem}
.status{font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;padding:.3em .9em;border-radius:100px;display:inline-block;border:1px solid rgba(236,227,211,.14);color:#cabfa9}
.status--active{color:#0a1f10;background:var(--gold-grad);border-color:transparent;font-weight:600}
.status--redeemed,.status--cancelled,.status--expired{color:#c2544a;border-color:rgba(194,84,74,.4)}
.meta{margin:1.6rem 0;display:grid;gap:.8rem;text-align:left}
.meta dt{font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:#c99f56}
.meta dd{color:#cabfa9;font-size:.92rem}
.note{color:#8f8676;font-size:.82rem;line-height:1.6;margin-bottom:1.6rem}
.btn{display:inline-block;background:var(--gold-grad);color:#1a1206;font-weight:600;text-decoration:none;
  padding:.9em 1.6em;border-radius:100px;font-size:.9rem}
h1{font-family:"Fraunces",Georgia,serif;font-weight:400;margin-bottom:.6rem}
</style></head><body>
<div class="card">
  <div class="brand">Beauty <em>&amp;</em> Color</div>
  <div class="sub">Inktale® · Gelsenkirchen</div>
  ${inner}
</div></body></html>`;
}
