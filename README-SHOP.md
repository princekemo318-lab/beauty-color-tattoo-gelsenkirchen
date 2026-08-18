# Gutschein-Shop — Setup, PayPal, Betrieb

Echter, produktionsreifer Gutschein-Shop auf der bestehenden Cloudflare-Basis.
**Kein Fake, keine Demo:** Bezahlung läuft über PayPal, die Zahlung wird
**serverseitig** verifiziert, erst dann werden Bestellung + Gutschein-Code(s) in D1
erzeugt, eine gebrandete Gutscheinseite `/voucher/<code>` bereitgestellt und eine
E-Mail versendet. Der Kunde verlässt die neue Website nie.

## Was übernommen wurde (aus dem Alt-Shop)
| Produkt | Preis (inkl. MwSt) |
|---|---|
| Tattoo-Gutschein | 50,00 € · 100,00 € |
| Piercing-Gutschein | 50,00 € · 100,00 € |
| Gutschein — Wunschbetrag | ab 200,00 € |

+ **1,80 € Versand/Bearbeitung** pro Bestellung, **19 % MwSt** ausgewiesen (wie im Alt-Checkout).
Das *Piercing-Seminar* ist **kein** Shop-Artikel (nur Anfrage über `/seminare/`).

## Ablauf (Zahlungssicherheit)
```
/shop/  → Warenkorb → E-Mail → PayPal-Button
  → POST /api/shop/paypal/create-order   (Betrag SERVERSEITIG aus dem Katalog, nie vom Client)
  → PayPal-Popup (inkl. Ratenzahlung/30 Tage, sofern PayPal sie anbietet)
  → POST /api/shop/paypal/capture-order  (SERVERSEITIGE Capture-Verifizierung + Betragsabgleich)
  → erst JETZT: Order = paid, Voucher-Code(s) BC-XXXX-XXXX (idempotent), E-Mail, /voucher/<code>
  + POST /api/shop/paypal/webhook        (signatur-verifiziertes Sicherheitsnetz)
```
Der Client kann **nie** Preis, Zahlungsstatus oder Gutscheinwert bestimmen.

## Einrichtung (zusätzlich zur CMS-Einrichtung in README-CMS.md)

Die D1-Tabellen `orders` + `vouchers` sind bereits in `schema.sql` — einmal ausführen
(`wrangler d1 execute bct-news --remote --file=./schema.sql`). R2 wird für den Shop **nicht** benötigt.

### PayPal
1. **developer.paypal.com → Apps & Credentials → LIVE → Create App** → **Client ID** + **Secret** notieren.
2. **Webhooks → Add Webhook**: URL `https://DEINE-DOMAIN/api/shop/paypal/webhook`,
   Events: **PAYMENT.CAPTURE.COMPLETED** und **CHECKOUT.ORDER.COMPLETED** → **Webhook ID** notieren.
3. Secrets in Cloudflare setzen (NICHT ins Repo):
   ```bash
   npx wrangler pages secret put PAYPAL_CLIENT_ID   --project-name beauty-color-tattoo-gelsenkirchen
   npx wrangler pages secret put PAYPAL_SECRET       --project-name beauty-color-tattoo-gelsenkirchen
   npx wrangler pages secret put PAYPAL_WEBHOOK_ID   --project-name beauty-color-tattoo-gelsenkirchen
   ```
   (oder Dashboard → Pages → Settings → Environment variables → **Encrypt**).
4. `PAYPAL_ENV = "live"` setzen (in `wrangler.toml` bzw. als Variable). Zum Testen `"sandbox"`.

### E-Mail (MailChannels — kein neuer SaaS-Account)
> Hinweis: Der bisherige GoDaddy-Gutscheinversand läuft in GoDaddys geschlossenem
> „Online Store"-Backend und ist **technisch nicht übertragbar** (kein API-/Template-Export).
> Der neue Shop versendet daher selbst — Cloudflare-nativ über MailChannels.

1. `MAIL_FROM = "shop@beautyandcolor-gelsenkirchen.de"` als Variable setzen (verifizierter Absender).
2. DNS der Domain: **SPF** `include:relay.mailchannels.net`, **DKIM**, und die
   **MailChannels-Domain-Lockdown**-TXT `_mailchannels` → `v=mc1 cfid=<dein-pages-subdomain>.pages.dev`.
3. Falls MailChannels für dein Konto nicht verfügbar ist: der Kunde bekommt die Gutscheinseite
   trotzdem sofort angezeigt; auf Wunsch stelle ich alternativ auf **Resend** um (dann `RESEND_API_KEY`).

## Testen (mit PayPal Sandbox)
`PAYPAL_ENV=sandbox` + Sandbox-Client-ID/Secret/Webhook-ID.
- [ ] Gutschein in den Warenkorb, Menge ändern, entfernen
- [ ] Summe = Positionen + 1,80 € · MwSt-Ausweis stimmt
- [ ] E-Mail-Pflichtfeld
- [ ] PayPal-Checkout (Sandbox-Käufer) → Zahlung erfolgreich → Gutscheinseite + Code + E-Mail
- [ ] Zahlung abbrechen / fehlschlagen → keine Bestellung „paid", kein Gutschein
- [ ] Webhook-Simulator (PayPal Dashboard) → Order wird auch ohne Browser abgeschlossen
- [ ] API-Manipulation: Betrag im Request wird **ignoriert** (Server rechnet aus dem Katalog)
- [ ] Doppelter Capture / Doppel-Klick → nur **ein** Gutschein (Idempotenz)
- [ ] `/admin` → einloggen → Tab „Bestellungen & Gutscheine": Bestellung, Code, Status; „Eingelöst"/„Stornieren"
- [ ] Mobil: Grid einspaltig, Buttons touch-freundlich, kein Layout-Shift

## Admin
`/admin` (eigener Login, siehe README-CMS.md) → Tab **Bestellungen & Gutscheine**: alle Bestellungen mit
Kunde/E-Mail, Betrag, MwSt, Status, Datum und Gutschein-Codes; Codes lassen sich als
**eingelöst** markieren, **stornieren** oder **reaktivieren**.

## Security-Checkliste (Shop)
- [x] Beträge **serverseitig** aus dem Katalog (Client kann Preise nicht setzen).
- [x] Zahlung **serverseitig** per PayPal-Capture verifiziert **vor** Gutscheinerstellung.
- [x] **Betragsabgleich** captured == gespeichert (Anti-Tamper).
- [x] **Idempotenz**: Order-Claim per `UPDATE ... WHERE status!='paid'`; Codes eindeutig (UNIQUE + Retry).
- [x] **Webhook signatur-verifiziert** (PayPal `verify-webhook-signature`).
- [x] Voucher-Codes **serverseitig**, unguessbar (`crypto.getRandomValues`, ohne 0/O/1/I).
- [x] D1 nur mit **Prepared Statements**.
- [x] Keine sensiblen Zahlungsdaten gespeichert (nur PayPal-Order-ID + Beträge/Status).
- [x] Admin/Schreiben durch eigenen Login + **serverseitige Session-Prüfung** in jedem Endpunkt.
- [x] Secrets nur serverseitig (nie im Frontend/Repo).

## Performance
- [x] PayPal-SDK lädt **nur auf `/shop/`** — Startseite/Three.js/GSAP/Mobile unverändert.
- [x] Kein Framework, kein Bundle; Warenkorb ist leichtes Vanilla-JS.
- [x] Gutscheinseite selbst-enthalten, `noindex`.

## Rechtliches (angelegt — vor Verkaufsstart prüfen)
- `/agb/` — **Grundlage sind die bestehenden AGB des Studios** (Termin/Kaution 50–100 €,
  Verschiebung 14/7 Tage, Ausfallhonorar 150 €, Nachstechen 35 €, Pflege, Hygiene,
  Urheberrecht an Vorlagen), ergänzt um die Shop-Paragraphen (Vertragsschluss, Preise +
  1,80 € Pauschale, PayPal, digitale Zustellung, Gutscheineinlösung/-gültigkeit, Widerruf,
  Haftung, Schlussbestimmungen).
- `/widerruf/` — Widerrufsbelehrung + Muster-Widerrufsformular, im Wortlaut am gesetzlichen
  Muster (Anlage 1/2 zu Art. 246a § 1 Abs. 2 EGBGB) orientiert, daher in der **Sie-Form**.
- Im Checkout muss vor dem Bezahlen die **Checkbox „AGB + Widerrufsbelehrung"** bestätigt werden
  (`#agbOk`, Prüfung in `shop/shop.js` vor `create-order`).
- Beide Seiten sind in Footer (alle Seiten), Shop-Fußzeile und `sitemap.xml` verlinkt.

**Vor dem Verkaufsstart entscheiden/prüfen lassen:**
1. Haftungsklausel (§ 14) ersetzt die pauschale „keinerlei Haftung"-Formulierung der Alt-AGB —
   eine pauschale Freizeichnung wäre gegenüber Verbrauchern unwirksam.
2. Neu hinzugefügte, im Alt-Text nicht enthaltene Punkte: Volljährigkeit/Gesundheitsangaben
   (§ 10), Fotoveröffentlichung nur mit Einwilligung (§ 11), Nachweisvorbehalt bei
   Kaution/Ausfallhonorar (§ 8), Gutschein-Restwert als Guthaben (§ 6).
3. **Teil-Einlösung** ist in der Software nicht abgebildet: Ein Code hat nur
   `aktiv`/`eingelöst`. Ein Restguthaben (§ 6 AGB) muss im Studio manuell notiert werden —
   oder wir bauen Teilbeträge nachträglich in D1 ein.
4. Kleinunternehmerregelung? Der Shop weist **19 % MwSt** aus — nur korrekt, wenn das Studio
   regelbesteuert ist.
