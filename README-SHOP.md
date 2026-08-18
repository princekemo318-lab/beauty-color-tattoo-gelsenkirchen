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

### PayPal + Resend — ab jetzt im Admin einzutragen (kein Code, kein Deployment)
`/admin` → Tab **Shop-Einstellungen**:

| Feld | Woher |
|---|---|
| PayPal Client ID | developer.paypal.com → Apps & Credentials → **Live** → App → Client ID |
| PayPal Secret | dieselbe App → Secret |
| PayPal Webhook ID | Webhooks → Add Webhook → danach die **Webhook-ID** |
| PayPal Umgebung | Sandbox zum Testen, **Live** für echtes Geld |
| Resend API Key | resend.com → API Keys (optional, für die Gutschein-Mail) |
| Absender-E-Mail | bei Resend verifizierte Adresse |

Webhook-URL im PayPal-Dashboard:
`https://beauty-color-tattoo-gelsenkirchen.pages.dev/api/shop/paypal/webhook`
Events: **PAYMENT.CAPTURE.COMPLETED** und **CHECKOUT.ORDER.COMPLETED**.

Danach **„Verbindung testen"** klicken — der Server holt ein PayPal-Token und prüft den
Resend-Schlüssel; es steht sofort da, ob die Daten stimmen.

**Wie die Werte gespeichert werden:** in der D1-Tabelle `settings`; Secret, Webhook-ID und
Resend-Key **AES-GCM-verschlüsselt** (Schlüssel = Pages-Secret `SETTINGS_KEY`, liegt außerhalb
der Datenbank). Zurück ins Admin-UI geht nur „gesetzt/nicht gesetzt" plus die letzten vier
Zeichen. Die Client ID ist bewusst öffentlich — das PayPal-SDK braucht sie im Browser.

Admin-Werte haben **Vorrang** vor gleichnamigen Umgebungsvariablen. Als Secrets gesetzt werden
müssen sie also nicht mehr; `wrangler pages secret put PAYPAL_*` funktioniert weiterhin als
Alternative.

Solange die Zugangsdaten fehlen, zeigt der Shop den WhatsApp-Fallback — es entsteht nie eine
halbfertige Bestellung. **Ratenzahlung / 30 Tage Zahlpause** sind aktiv (`enable-funding=paylater`);
ob sie angeboten werden, entscheidet PayPal.

### Lokal testen ohne echte Zugangsdaten
`functions/_shared/paypal.js` akzeptiert `PAYPAL_ENV="mock"` zusammen mit `PAYPAL_MOCK_BASE`.
Damit lässt sich die komplette Kette (Order → Capture → Webhook → Gutschein) gegen einen
lokalen Nachbau der PayPal-API durchspielen — genau so wurde sie geprüft. In Produktion steht
`PAYPAL_ENV` auf `live`/`sandbox`, der Zweig ist dort unerreichbar.

### E-Mail — was mit der alten Lösung ist
Der bisherige Gutscheinversand steckt im **IONOS-eCommerce-Backend** des alten Auftritts
(die alte Seite ist eine IONOS-MyWebsite mit IONOS-Shop, nicht GoDaddy). Er wird nur ausgelöst,
wenn eine Bestellung **in diesem** Shop entsteht, und bietet weder API noch Template-Export.
Für einen eigenen Shop ist er damit technisch nicht nutzbar — unabhängig davon, ob der
IONOS-Vertrag bestehen bleibt.

Cloudflare selbst kann keine Mails an beliebige Empfänger senden (Email Routing ist eingehend;
das `send_email`-Binding darf nur an **verifizierte** Adressen zustellen). MailChannels, früher
der kostenlose Weg aus Workers heraus, ist seit 2024 kostenpflichtig.

**Der Shop funktioniert ohne E-Mail vollständig:** Der Code erscheint sofort auf der
Bestätigungsseite, ist dauerhaft unter `/voucher/<code>` abrufbar und dort ausdruckbar; im
Admin stehen alle Bestellungen samt Codes. Der Bestätigungstext sagt ehrlich, ob eine Mail
unterwegs ist (`emailed`-Flag aus `capture-order`).

Soll zusätzlich automatisch eine Gutschein-Mail rausgehen, genügt **ein** Zugang — der Code
erkennt selbst, welcher gesetzt ist:

| Variablen | Anbieter |
|---|---|
| `MAIL_FROM` + `RESEND_API_KEY` | Resend (kostenloses Kontingent, schnellste Einrichtung) |
| `MAIL_FROM` + `BREVO_API_KEY` | Brevo |
| `MAIL_FROM` + `MAILCHANNELS_API_KEY` | MailChannels (kostenpflichtig) |

`MAIL_FROM` muss beim jeweiligen Anbieter als Absender verifiziert sein.

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
