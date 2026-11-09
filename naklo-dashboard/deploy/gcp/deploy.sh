#!/usr/bin/env bash
# Build a nasazení Náklo Dashboardu na Cloud Run (web za IAP) + plánované úlohy (Cloud Run Jobs + Cloud Scheduler).
#   bash deploy/gcp/deploy.sh            # build + nasazení všeho
#   bash deploy/gcp/deploy.sh --no-build # jen přenasadit poslední obraz (např. po změně tajemství)
set -euo pipefail
cd "$(dirname "$0")"
source ./config.env
APP_DIR="$(cd ../.. && pwd)"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUN_SA_EMAIL="$RUN_SA@$PROJECT_ID.iam.gserviceaccount.com"
SCHED_SA_EMAIL="$SCHEDULER_SA@$PROJECT_ID.iam.gserviceaccount.com"
SQL_CONN="$PROJECT_ID:$REGION:$SQL_INSTANCE"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/naklo-dashboard"
TAG_FILE=".last-tag"

if [ "${1:-}" != "--no-build" ]; then
  TAG="$(date -u +%Y%m%d-%H%M%S)-$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
  echo "== Build $IMAGE:$TAG (Cloud Build)"
  gcloud builds submit "$APP_DIR" --region="$REGION" --config=cloudbuild.yaml \
    --substitutions="_IMAGE=$IMAGE,_TAG=$TAG"
  echo "$TAG" > "$TAG_FILE"
fi
TAG="$(cat "$TAG_FILE")"

# Proměnné prostředí (soubor, protože ALLOWED_EMAILS obsahuje čárky).
ENV_FILE="$(mktemp)"; trap 'rm -f "$ENV_FILE"' EXIT
{
  echo "ALLOWED_DOMAIN: \"$ALLOWED_DOMAIN\""
  echo "ALLOWED_EMAILS: \"$ALLOWED_EMAILS\""
  echo "AUTH_TRUST_HOST: \"true\""
  echo "DATABASE_SOCKET_DIR: \"/cloudsql/$SQL_CONN\""
  echo "KB_API_BASE: \"$KB_API_BASE\""
  echo "KILOMAYO_BASE_URL: \"$KILOMAYO_BASE_URL\""
  echo "KILOMAYO_LOGIN_EMAIL: \"$KILOMAYO_LOGIN_EMAIL\""
  [ -n "$EVENTS_SHEET_ID" ] && echo "EVENTS_SHEET_ID: \"$EVENTS_SHEET_ID\""
  if [ -n "$DASHBOARD_URL" ]; then
    echo "DASHBOARD_URL: \"$DASHBOARD_URL\""
    echo "AUTH_URL: \"$DASHBOARD_URL\""
    echo "KB_REDIRECT_URI: \"$DASHBOARD_URL/api/bank/kb/callback\""
  fi
} > "$ENV_FILE"

# Jen tajemství, která už mají hodnotu (KB klíče apod. lze doplnit později).
SECRETS=""
while read -r name; do
  [ -z "$name" ] && continue
  if [ -n "$(gcloud secrets versions list "$name" --filter=state=enabled --limit=1 --format='value(name)' 2>/dev/null)" ]; then
    SECRETS="${SECRETS:+$SECRETS,}$name=$name:latest"
  else
    echo "   (přeskakuji prázdné tajemství $name)"
  fi
done < <(grep -v '^#' secrets.txt)
has_secret() { [[ ",$SECRETS," == *",$1=$1:latest,"* ]]; }

echo "== Web: Cloud Run služba $SERVICE (bez veřejného přístupu, za IAP)"
gcloud run deploy "$SERVICE" --image="$IMAGE:$TAG" --region="$REGION" \
  --service-account="$RUN_SA_EMAIL" --set-cloudsql-instances="$SQL_CONN" \
  --env-vars-file="$ENV_FILE" ${SECRETS:+--set-secrets="$SECRETS"} \
  --no-allow-unauthenticated --iap \
  --cpu=1 --memory=512Mi --min-instances=0 --max-instances=3 --concurrency=40 --timeout=300

# IAP potřebuje právo službu volat; přístup lidí řídí IAP_MEMBERS.
gcloud beta services identity create --service=iap.googleapis.com --project="$PROJECT_ID" >/dev/null 2>&1 || true
gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" \
  --member="serviceAccount:service-$PROJECT_NUMBER@gcp-sa-iap.iam.gserviceaccount.com" \
  --role=roles/run.invoker >/dev/null
for m in $IAP_MEMBERS; do
  gcloud iap web add-iam-policy-binding --member="$m" --role=roles/iap.httpsResourceAccessor \
    --region="$REGION" --resource-type=cloud-run --service="$SERVICE" >/dev/null
done

echo "== Úlohy: Cloud Run Jobs"
deploy_job() { # název, npm skript
  gcloud run jobs deploy "naklo-$1" --image="$IMAGE-jobs:$TAG" --region="$REGION" --args="$2" \
    --service-account="$RUN_SA_EMAIL" --set-cloudsql-instances="$SQL_CONN" \
    --env-vars-file="$ENV_FILE" ${SECRETS:+--set-secrets="$SECRETS"} \
    --cpu=1 --memory=1Gi --max-retries=1 --task-timeout=900 >/dev/null
  echo "   naklo-$1 ($2)"
}
schedule_job() { # název, cron
  local uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/naklo-$1:run"
  local verb=create
  gcloud scheduler jobs describe "naklo-$1" --location="$REGION" >/dev/null 2>&1 && verb=update
  gcloud scheduler jobs "$verb" http "naklo-$1" --location="$REGION" --schedule="$2" \
    --time-zone="$TZ_SCHEDULE" --uri="$uri" --http-method=POST \
    --oauth-service-account-email="$SCHED_SA_EMAIL" >/dev/null
  echo "   plán naklo-$1: $2 ($TZ_SCHEDULE)"
}
deploy_job db-push db:push
deploy_job bot bot;                         schedule_job bot "$CRON_BOT"
deploy_job sync-bank sync:bank
has_secret KB_SOFTWARE_STATEMENT &&         schedule_job sync-bank "$CRON_BANK"
deploy_job sync-events sync:events
[ -n "$EVENTS_SHEET_ID" ] && has_secret GOOGLE_SERVICE_ACCOUNT_JSON && schedule_job sync-events "$CRON_EVENTS"
deploy_job sync-kilomayo sync:kilomayo
has_secret KILOMAYO_PASSWORD &&             schedule_job sync-kilomayo "$CRON_KILOMAYO"

URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
echo
echo "Nasazeno: $URL"
[ -z "$DASHBOARD_URL" ] && echo "Doplň DASHBOARD_URL=$URL do deploy/gcp/config.env a spusť deploy.sh --no-build."
echo "Schéma databáze: gcloud run jobs execute naklo-db-push --region=$REGION --wait"
