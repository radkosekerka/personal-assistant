# Nasazení na Google Cloud (EU)

## Jak to vypadá

```
prohlížeč ──► IAP (Google login, jen @wakesurfnaklo.cz) ──► Cloud Run „naklo-dashboard“ (europe-west1)
                                                              │  aplikace znovu ověří Google login + ALLOWED_EMAILS
                                                              ▼
Cloud Scheduler ──► Cloud Run Jobs (bot, sync-bank, sync-events, sync-kilomayo) ──► Cloud SQL PostgreSQL 16 (europe-west1)
                                                              ▲
                                               Secret Manager (hesla, klíče, KB certifikát)
```

- **Dva zámky.** IAP pustí k aplikaci jen přihlášené účty z domény wakesurfnaklo.cz, nic jiného na server vůbec nedojde.
  Aplikace pak ještě kontroluje seznam `ALLOWED_EMAILS`. Kdo není na seznamu, nic neuvidí, i když má účet ve firmě.
- **Plánované úlohy neběží přes web.** Cloud Scheduler spouští Cloud Run Jobs přímo, takže `/api/cron/*` zvenku nejsou potřeba
  (zůstávají jen pro případný běh na Vercelu).
- **Data jen v EU** (Belgie): server, databáze, zálohy (14 dní) i tajemství.
- **Odhad ceny:** Cloud SQL `db-f1-micro` cca 10 USD/měsíc, Cloud Run při pár uživatelích v bezplatném limitu,
  Secret Manager a Scheduler pod 1 USD. Celkem zhruba **250–350 Kč měsíčně**.

## Co udělá Radko (jednou)

1. **GCP projekt.** Na <https://console.cloud.google.com/projectcreate> přihlášený jako `radko@wakesurfnaklo.cz`
   založ projekt `naklo-dashboard` v organizaci *wakesurfnaklo.cz* a připoj k němu fakturační účet
   (Billing). Když ID projektu vyjde jinak, přepiš `PROJECT_ID` v `config.env`.
2. **OAuth pro přihlášení do aplikace.** *APIs & Services → OAuth consent screen*: typ **Internal**, název „Náklo Dashboard“.
   Pak *Credentials → Create credentials → OAuth client ID → Web application*. Redirect URI doplníš po prvním nasazení (krok 5).
   Client ID a secret si zatím ulož.
3. **Spusť přípravu** v Cloud Shellu (ikona `>_` vpravo nahoře v konzoli):
   ```bash
   git clone https://github.com/radkosekerka/personal-assistant.git && cd personal-assistant
   git checkout claude/project-thread-8fsy3t && cd naklo-dashboard
   bash deploy/gcp/setup.sh
   ```
   Repozitář je soukromý: když `git clone` chce heslo, nejdřív `gh auth login` (v Cloud Shellu je nainstalované).
   Vytvoří databázi, servisní účty a tajemství (`DATABASE_URL`, `AUTH_SECRET`, `BANK_ENCRYPTION_KEY` vygeneruje sám).
4. **Doplň tajemství** (stačí ta, která máš, ostatní se přeskočí):
   ```bash
   printf '%s' 'CLIENT_ID'     | gcloud secrets versions add AUTH_GOOGLE_ID --data-file=-
   printf '%s' 'CLIENT_SECRET' | gcloud secrets versions add AUTH_GOOGLE_SECRET --data-file=-
   printf '%s' 'KLÍČ'          | gcloud secrets versions add GEMINI_API_KEY --data-file=-
   printf '%s' 'HESLO'         | gcloud secrets versions add KILOMAYO_PASSWORD --data-file=-
   gcloud secrets versions add GOOGLE_SERVICE_ACCOUNT_JSON --data-file=klic-servisniho-uctu.json
   ```
   KB klíče (`KB_API_KEY_OAUTH`, `KB_API_KEY_ADAA`, `KB_SOFTWARE_STATEMENT`) přidáš, až budou z developers.kb.cz.
5. **Nasaď:** `bash deploy/gcp/deploy.sh`. Na konci vypíše adresu `https://naklo-dashboard-….europe-west1.run.app`.
   - zapiš ji do `DASHBOARD_URL` v `config.env` a spusť `bash deploy/gcp/deploy.sh --no-build`,
   - v OAuth klientovi (krok 2) přidej redirect URI `<adresa>/api/auth/callback/google`,
   - vytvoř tabulky: `gcloud run jobs execute naklo-db-push --region=europe-west1 --wait`.
6. **Otevři adresu**, přihlas se Google účtem. Hotovo.

Každá další verze: `bash deploy/gcp/deploy.sh` (a když se mění schéma, znovu job `naklo-db-push`).

## Vlastní doména (volitelně později)

`dashboard.wakesurfnaklo.cz`: Cloud Run *Domain mappings* (u DNS pak jeden CNAME na `ghs.googlehosted.com`).
Kdyby IAP s mapováním domény nespolupracoval, alternativa je globální load balancer s IAP (asi +18 USD měsíčně).
Po změně domény upravit `DASHBOARD_URL`, redirect URI v OAuth klientovi a v KB (`KB_REDIRECT_URI` se odvozuje sám).

## Přístupy a provoz

- Přidat člověka: jeho e-mail do `ALLOWED_EMAILS` v `config.env` a `deploy.sh --no-build`.
- Ruční běh úlohy: `gcloud run jobs execute naklo-sync-bank --region=europe-west1`.
- Logy: konzole → Cloud Run → služba nebo job → *Logs*.
- Zálohy databáze: denně v 1:00 UTC, drží se 14 dní (Cloud SQL → *Backups*).
