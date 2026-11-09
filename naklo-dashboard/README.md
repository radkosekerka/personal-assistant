# Náklo Dashboard

Interní dashboard Wake Surf Náklo. Moduly: **HR**, **Events** a **Finance** (banka KB), Kemp, Wakesurf, Bistro a Wakeboard (připravované).
Přístup jen přes Google účet `@wakesurfnaklo.cz` ze seznamu `ALLOWED_EMAILS`.

## Co umí

**HR**
- Lidé: typ vztahu (HPP, DPP, DPČ, IČO), firma, smlouvy, sazby, hodiny a platby po měsících.
- Red flags: práce bez podepsané smlouvy, smlouva jen v návrhu nebo končí, limit DPP 300 h/rok, DPČ nad 20 h/týden,
  chybějící výplata po termínu, chybějící nebo nesedící faktura IČO, faktura po splatnosti, duplicitní platba.
- Tým: kdo nám chybí (potřeba lidí na pozice), koho vyškolit (povinná školení podle pozice), top performeři, sledovat a na odchod.
- Úkoly: z každého red flagu jedním kliknutím.

**Events**
- Poptávky z webových formulářů bez odpovědi, nové a rozjednané akce, kalendář potvrzených akcí, akce na příští rok, leady.
- Red flags: poptávka bez odpovědi déle než 2 dny (kritické po 7), rozjednaná akce po termínu, blízká akce bez počtu lidí.

Kontroly jsou čisté funkce v `lib/checks` a `lib/events/checks.ts`, aby je mohl volat i budoucí WhatsApp agent.

## Zdroje dat

| Zdroj | Stav | Jak |
| --- | --- | --- |
| KiloMayo (směny, hodiny) | kostra | `lib/kilomayo/client.ts`: přihlášení magic linkem z info@, interní API webu. Doplnit těla dotazů z DevTools. Do té doby `npm run import:hours -- soubor.csv` |
| Tabulka Event Form 2026 | hotovo | `npm run sync:events` (servisní účet, jen čtení) |
| Banka KB (zůstatky, pohyby) | hotovo, čeká na registraci u KB | KB API Account Direct Access, viz sekce Banka. `npm run sync:bank`, cron `/api/cron/bank` |
| Rekapitulace mezd, smlouvy z Drive | další krok | zatím ruční zadání do DB |

## Banka (Komerční banka)

Modul **Finance** stahuje zůstatky a pohyby ze všech účtů KB přes oficiální
[KB API Account Direct Access (ADAA)](https://www.kb.cz/en/kbapi/kb-api-services/account-direct-access).
Jen čtení: žádá se pouze scope `adaa`, platby (`bpisp`) ani karty ne.

Co ukazuje: disponibilní a účetní zůstatky po účtech a firmách, součty po měnách, cashflow 6 měsíců
(bez převodů mezi vlastními účty), pohyby s filtrem. Red flags pro bota: nízký zůstatek (hranice u účtu),
velká odchozí platba (od 100 000 Kč), souhlas brzy vyprší nebo vypršel, data nejsou čerstvá, chyba synchronizace.

**Podmínky KB:** majitel účtu je firma nebo OSVČ, přístup přes MojeBanka / MojeBanka Business, KB klíč.
Do 50 stažení měsíčně zdarma; synchronizace jednou denně u víc účtů může vyžadovat placenou variantu
(100 Kč/měsíc za firmu, stahování jednou za hodinu). Souhlas platí 12 měsíců, obnovuje se tlačítkem
„Obnovit souhlas“ (stačí přihlášení do KB, registrace zůstává).

### Jednorázové nastavení

1. Registrace na [developers.kb.cz](https://developers.kb.cz) (produkční API portál), aplikace „Náklo Dashboard“,
   odběr služeb **Client Registration**, **OAuth2** a **Account Direct Access**, ke každé API klíč.
2. Kvalifikovaný certifikát pro elektronickou pečeť na firmu, která aplikaci provozuje (I.CA nebo PostSignum,
   vyplnit název organizace a IČO). Slouží jen k vytvoření software statementu, do aplikace se nenahrává.
3. `npm run kb:statement` (proměnné v hlavičce `scripts/kb-software-statement.ts`) → JWT do `KB_SOFTWARE_STATEMENT`.
   Platí 12 měsíců, pak skript spustit znovu.
4. Do prostředí (Secret Manager): `BANK_ENCRYPTION_KEY` (`openssl rand -base64 32`), `KB_API_KEY_OAUTH`,
   `KB_API_KEY_ADAA`, `KB_SOFTWARE_STATEMENT`, `KB_REDIRECT_URI` (`https://<dashboard>/api/bank/kb/callback`).
5. V dashboardu **Finance → Bankovní propojení → Pokračovat do KB**. Člověk s přístupem k účtům firmy se přihlásí
   do KB, vybere účty, potvrdí KB klíčem a pak ještě jednou potvrdí oprávnění. Opakovat pro každou firmu.

Tok: registrace aplikace (`/api/bank/kb/registrace`, KB vrací client_id a client_secret šifrované AES-GCM) →
autorizační kód (`/api/bank/kb/callback`) → refresh token na 12 měsíců → access token na 3 minuty → ADAA.
Tajemství jsou v DB jen zašifrovaná (`BANK_ENCRYPTION_KEY`). Historii pohybů KB pustí stáhnout jednou za 61 minut
na účet; blokace (PDNG) a zaúčtování (BOOK) se párují přes `references.accountServicer`.

Osobní (nepodnikatelské) účty ADAA nepodporuje. Pro ně by byl potřeba licencovaný agregátor (PSD2 AIS),
nebo import výpisů.

## Lokální spuštění

```bash
cp .env.example .env            # vyplnit DATABASE_URL, pro vývoj AUTH_DISABLED=1
npm install
npm run db:push                 # vytvoří tabulky
npm run db:seed                 # vymyšlená demo data
npm run dev
npm test
```

## Nasazení

Google Cloud v EU: Cloud Run za IAP, Cloud SQL, plánované úlohy přes Cloud Scheduler. Postup krok za krokem v [`deploy/gcp/README.md`](deploy/gcp/README.md).

## Bezpečnost

- Žádné osobní údaje v repozitáři (`.gitignore` blokuje `data/` a `*.csv`), demo data jsou vymyšlená.
- Přihlášení: Google, omezená doména a seznam e-mailů. Server actions ověřují uživatele znovu, nespoléhají jen na middleware.
- `AUTH_DISABLED` funguje jen mimo produkci.
- Ke KiloMayo, Google Sheets a bance jen čtecí přístup. Každá synchronizace a změna jde do `audit_log`.
- Databáze má být samostatná (EU), ne databáze webu wakesurfnaklo.cz.
