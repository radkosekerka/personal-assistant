#!/usr/bin/env bash
# Jednorázová příprava GCP projektu pro Náklo Dashboard. Lze pouštět opakovaně (co existuje, přeskočí).
# Spouštěj z Cloud Shellu nebo z Macu s gcloud, přihlášený jako radko@wakesurfnaklo.cz:
#   bash deploy/gcp/setup.sh
set -euo pipefail
cd "$(dirname "$0")"
source ./config.env

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "== Zapínám API"
gcloud services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com iap.googleapis.com cloudscheduler.googleapis.com \
  sheets.googleapis.com

echo "== Artifact Registry"
gcloud artifacts repositories describe "$REPO" --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" \
    --description="Obrazy Náklo Dashboardu"

echo "== Servisní účty"
for sa in "$RUN_SA" "$SCHEDULER_SA"; do
  gcloud iam service-accounts describe "$sa@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1 ||
    gcloud iam service-accounts create "$sa" --display-name="$sa"
done
RUN_SA_EMAIL="$RUN_SA@$PROJECT_ID.iam.gserviceaccount.com"
SCHED_SA_EMAIL="$SCHEDULER_SA@$PROJECT_ID.iam.gserviceaccount.com"
for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$RUN_SA_EMAIL" \
    --role="$role" --condition=None >/dev/null
done
# Cloud Scheduler smí spouštět Cloud Run Jobs (plánované synchronizace a bot).
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SCHED_SA_EMAIL" \
  --role=roles/run.invoker --condition=None >/dev/null
# Cloud Build smí nahrávat obrazy.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role=roles/artifactregistry.writer --condition=None >/dev/null 2>&1 || true

echo "== Cloud SQL (PostgreSQL 16, $SQL_TIER, $REGION) – první vytvoření trvá ~10 minut"
if ! gcloud sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 --edition=ENTERPRISE \
    --tier="$SQL_TIER" --region="$REGION" --availability-type=zonal \
    --storage-type=SSD --storage-size=10 --storage-auto-increase \
    --backup-start-time=01:00 --retained-backups-count=14
fi
gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1 ||
  gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"

secret_exists() { gcloud secrets describe "$1" >/dev/null 2>&1; }
secret_has_value() { [ -n "$(gcloud secrets versions list "$1" --filter=state=enabled --limit=1 --format='value(name)' 2>/dev/null)" ]; }
ensure_secret() { secret_exists "$1" || gcloud secrets create "$1" --replication-policy=user-managed --locations="$REGION" >/dev/null; }
set_secret() { ensure_secret "$1"; printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null; }

echo "== Tajemství"
if ! secret_has_value DATABASE_URL; then
  DB_PASS=$(openssl rand -hex 24)
  if gcloud sql users list --instance="$SQL_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
    gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS"
  else
    gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS"
  fi
  # Host se ignoruje, aplikace jde přes unix socket (DATABASE_SOCKET_DIR).
  set_secret DATABASE_URL "postgres://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
fi
secret_has_value AUTH_SECRET || set_secret AUTH_SECRET "$(openssl rand -base64 32)"
secret_has_value BANK_ENCRYPTION_KEY || set_secret BANK_ENCRYPTION_KEY "$(openssl rand -base64 32)"
grep -v '^#' secrets.txt | while read -r name; do [ -n "$name" ] && ensure_secret "$name"; done

echo
echo "Hotovo. Chybějící tajemství (doplň, pak spusť deploy.sh):"
grep -v '^#' secrets.txt | while read -r name; do
  [ -n "$name" ] && ! secret_has_value "$name" && echo "  - $name"
done
true
