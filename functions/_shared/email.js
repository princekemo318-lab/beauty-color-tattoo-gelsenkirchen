// Gutschein-E-Mail — anbieterunabhängig.
//
// Warum nicht die alte Lösung? Der bisherige Gutscheinversand läuft im geschlossenen
// IONOS-eCommerce-Backend des alten Auftritts: Er wird nur ausgelöst, wenn eine Bestellung
// IN DIESEM Shop entsteht, und es gibt weder API noch Template-Export. Er ist damit für einen
// eigenen Shop technisch nicht nutzbar.
//
// Cloudflare selbst kann keine E-Mails an beliebige Empfänger senden (Email Routing ist
// eingehend; das send_email-Binding darf nur an verifizierte Adressen senden). Für den
// Versand an Kundinnen und Kunden braucht es deshalb genau EINEN Mail-Zugang. Unterstützt
// werden — je nachdem, was gesetzt ist:
//
//   RESEND_API_KEY        → Resend        (kostenloses Kontingent, schnellste Einrichtung)
//   BREVO_API_KEY         → Brevo
//   MAILCHANNELS_API_KEY  → MailChannels  (seit 2024 kostenpflichtig, kein Gratis-Worker-Zugang mehr)
//
// Plus MAIL_FROM = verifizierte Absenderadresse.
//
// Ist nichts gesetzt, wird NICHT gesendet und NICHTS behauptet: Die Bestellung bleibt gültig,
// der Gutschein wird sofort auf der Bestätigungsseite angezeigt und ist dauerhaft unter
// /voucher/<code> erreichbar; das Shop-Frontend passt seinen Text entsprechend an.

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function mailProvider(env) {
  if (!env.MAIL_FROM) return null;
  if (env.RESEND_API_KEY) return "resend";
  if (env.BREVO_API_KEY) return "brevo";
  if (env.MAILCHANNELS_API_KEY) return "mailchannels";
  return null;
}

export function buildVoucherHtml({ name, order, vouchers, origin }) {
  const rows = vouchers.map((v) =>
    `<tr>
       <td style="padding:8px 0;color:#ece3d3">${esc(v.title)}</td>
       <td style="padding:8px 0;color:#e7c880;font-weight:600;text-align:right">${esc(v.value.toFixed(2))} €</td>
     </tr>
     <tr><td colspan="2" style="padding:0 0 12px">
       <span style="font-family:monospace;font-size:18px;letter-spacing:2px;color:#e7c880">${esc(v.code)}</span>
       &nbsp;&nbsp;<a href="${esc(origin)}/voucher/${esc(v.code)}" style="color:#c99f56">Gutschein ansehen</a>
     </td></tr>`).join("");

  return `<div style="background:#0a090c;color:#ece3d3;font-family:Arial,Helvetica,sans-serif;padding:28px">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(201,159,86,.3);border-radius:14px;padding:28px;background:#16131a">
    <h1 style="font-size:22px;margin:0 0 4px;color:#ece3d3">Beauty &amp; Color Tattoo</h1>
    <p style="color:#c99f56;letter-spacing:3px;font-size:11px;margin:0 0 20px">DEINE GESCHICHTE. DEIN TATTOO.</p>
    <p style="color:#cabfa9">Hallo${name ? " " + esc(name) : ""}, vielen Dank für Deinen Kauf! Hier ${vouchers.length > 1 ? "sind Deine Gutscheine" : "ist Dein Gutschein"}:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
    <p style="color:#8f8676;font-size:13px;border-top:1px solid rgba(236,227,211,.1);padding-top:14px">
      Bestell-Nr. ${esc(order.id)} · Gesamt ${esc(order.amount_total.toFixed(2))} € inkl. ${esc(order.amount_tax.toFixed(2))} € MwSt.<br>
      Einlösbar im Studio · De-la-Chevallerie-Str. 32, 45894 Gelsenkirchen.<br>
      Es gelten unsere AGB: <a href="${esc(origin)}/agb/" style="color:#c99f56">${esc(origin)}/agb/</a><br>
      Fragen? Schreib uns auf WhatsApp: 0176 84962255.
    </p>
  </div>
</div>`;
}

/** Best effort: ein Fehler hier darf die (bereits bezahlte) Bestellung nie kippen. */
export async function sendVoucherEmail(env, { to, name, order, vouchers, origin }) {
  const provider = mailProvider(env);
  if (!provider) return { sent: false, skipped: "kein Mailanbieter konfiguriert" };

  const html = buildVoucherHtml({ name, order, vouchers, origin });
  const subject = "Dein Gutschein bei Beauty & Color Tattoo";
  const from = env.MAIL_FROM;
  const fromName = "Beauty & Color Tattoo";

  let res;
  try {
    if (provider === "resend") {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, html }),
      });
    } else if (provider === "brevo") {
      res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          sender: { email: from, name: fromName },
          to: [{ email: to, name: name || undefined }],
          subject, htmlContent: html,
        }),
      });
    } else {
      res = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "content-type": "application/json", "X-Api-Key": env.MAILCHANNELS_API_KEY },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to, name: name || undefined }] }],
          from: { email: from, name: fromName },
          subject,
          content: [{ type: "text/html", value: html }],
        }),
      });
    }
  } catch (e) {
    return { sent: false, provider, error: String(e && e.message) };
  }

  return { sent: !!(res && res.ok), provider, status: res ? res.status : 0 };
}
