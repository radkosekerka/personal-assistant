# Náklo Dashboard

Interní dashboard Wake Surf Náklo. Moduly: **HR** a **Events** (hotové), Finance, Kemp, Wakesurf, Bistro a Wakeboard (připravované).
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
| Banka, rekapitulace mezd, smlouvy z Drive | další krok | zatím ruční zadání do DB |

## Lokální spuštění

```bash
cp .env.example .env            # vyplnit DATABASE_URL, pro vývoj AUTH_DISABLED=1
npm install
npm run db:push                 # vytvoří tabulky
npm run db:seed                 # vymyšlená demo data
npm run dev
npm test
```

## Bezpečnost

- Žádné osobní údaje v repozitáři (`.gitignore` blokuje `data/` a `*.csv`), demo data jsou vymyšlená.
- Přihlášení: Google, omezená doména a seznam e-mailů. Server actions ověřují uživatele znovu, nespoléhají jen na middleware.
- `AUTH_DISABLED` funguje jen mimo produkci.
- Ke KiloMayo, Google Sheets a bance jen čtecí přístup. Každá synchronizace a změna jde do `audit_log`.
- Databáze má být samostatná (EU), ne databáze webu wakesurfnaklo.cz.
