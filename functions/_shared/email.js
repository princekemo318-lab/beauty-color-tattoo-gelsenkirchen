// Voucher e-mail via MailChannels (Cloudflare-native, no third-party account).
// Requires env.MAIL_FROM (verified sender, e.g. "shop@beautyandcolor-gelsenkirchen.de")
// and DNS setup (SPF/DKIM + MailChannels domain lockdown) — see README-CMS.md.
// Best-effort: a failure here must NOT fail the (already captured) payment.

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export async function sendVoucherEmail(env, { to, name, order, vouchers, origin }) {
  if (!env.MAIL_FROM) return { skipped: "MAIL_FROM nicht gesetzt" };

  const rows = vouchers.map((v) =>
    `<tr>
       <td style="padding:8px 0;color:#ece3d3">${esc(v.title)}</td>
       <td style="padding:8px 0;color:#e7c880;font-weight:600;text-align:right">${esc(v.value.toFixed(2))} €</td>
     </tr>
     <tr><td colspan="2" style="padding:0 0 12px">
       <span style="font-family:monospace;font-size:18px;letter-spacing:2px;color:#e7c880">${esc(v.code)}</span>
       &nbsp;&nbsp;<a href="${esc(origin)}/voucher/${esc(v.code)}" style="color:#c99f56">Gutschein ansehen</a>
     </td></tr>`).join("");

  const html =
`<div style="background:#0a090c;color:#ece3d3;font-family:Arial,Helvetica,sans-serif;padding:28px">
  <div style="max-width:560px;margin:0 auto;border:1px solid rgba(201,159,86,.3);border-radius:14px;padding:28px;background:#16131a">
    <h1 style="font-size:22px;margin:0 0 4px;color:#ece3d3">Beauty &amp; Color Tattoo</h1>
    <p style="color:#c99f56;letter-spacing:3px;font-size:11px;margin:0 0 20px">DEINE GESCHICHTE. DEIN TATTOO.</p>
    <p style="color:#cabfa9">Hallo${name ? " " + esc(name) : ""}, vielen Dank für Deinen Kauf! Hier ${vouchers.length > 1 ? "sind Deine Gutscheine" : "ist Dein Gutschein"}:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}</table>
    <p style="color:#8f8676;font-size:13px;border-top:1px solid rgba(236,227,211,.1);padding-top:14px">
      Bestell-Nr. ${esc(order.id)} · Gesamt ${esc(order.amount_total.toFixed(2))} € inkl. ${esc(order.amount_tax.toFixed(2))} € MwSt.<br>
      Einlösbar im Studio · De-la-Chevallerie-Str. 32, 45894 Gelsenkirchen.<br>
      Fragen? Schreib uns auf WhatsApp: 0176 84962255.
    </p>
  </div>
</div>`;

  const body = {
    personalizations: [{ to: [{ email: to, name: name || undefined }] }],
    from: { email: env.MAIL_FROM, name: "Beauty & Color Tattoo" },
    subject: "Dein Gutschein bei Beauty & Color Tattoo",
    content: [{ type: "text/html", value: html }],
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}
