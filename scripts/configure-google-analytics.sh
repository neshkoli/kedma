#!/usr/bin/env bash
# Configure GA4 property for kedma.xyz via Google Analytics Admin API + gcloud ADC.
#
# NOTE: Google's built-in gcloud OAuth client is blocked for analytics.edit on many
# personal accounts ("This app is blocked"). Two options:
#
#   A) Skip this script — data collection already works on www.kedma.xyz.
#      Finish optional setup in the GA web UI (see docs/google-analytics-setup.md).
#
#   B) Use your own OAuth Desktop client from the kedma-podcast GCP project:
#      1. https://console.cloud.google.com/apis/credentials?project=kedma-podcast
#         → Create credentials → OAuth client ID → Desktop app → "Kedma GA CLI"
#      2. https://console.cloud.google.com/auth/audience?project=kedma-podcast
#         → Add your Google account under Test users
#      3. Save the downloaded JSON as migration/ga-oauth-client.json (gitignored)
#      4. gcloud auth application-default login \
#           --client-id-file=migration/ga-oauth-client.json \
#           --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform,openid,https://www.googleapis.com/auth/userinfo.email
#      5. ./scripts/configure-google-analytics.sh
#
# Usage:
#   ./scripts/configure-google-analytics.sh

set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-kedma-podcast}"
MEASUREMENT_ID="${PUBLIC_GA_MEASUREMENT_ID:-G-14BQQ9TGBK}"
SITE_URL="${ASTRO_SITE:-https://www.kedma.xyz}"

ADC_SCOPES="https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform,openid,https://www.googleapis.com/auth/userinfo.email"

require_gcloud() {
  command -v gcloud >/dev/null || {
    echo "Install gcloud: https://cloud.google.com/sdk/docs/install" >&2
    exit 1
  }
  gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1 >/dev/null || {
    echo "Run: gcloud auth login" >&2
    exit 1
  }
  gcloud config set project "$GCP_PROJECT" >/dev/null
  gcloud auth application-default set-quota-project "$GCP_PROJECT" >/dev/null 2>&1 || true
}

require_adc_scopes() {
  local python_bin="$1"
  if ! ADC_SCOPES="$ADC_SCOPES" "$python_bin" - <<'PY'
import os
import google.auth
import google.auth.transport.requests
from google.analytics.admin_v1beta import AnalyticsAdminServiceClient

scopes = os.environ["ADC_SCOPES"].split(",")
creds, _ = google.auth.default(scopes=scopes)
creds.refresh(google.auth.transport.requests.Request())
client = AnalyticsAdminServiceClient(credentials=creds)
next(client.list_account_summaries(page_size=1))
print("ok")
PY
  then
    cat >&2 <<EOF
Application Default Credentials are missing the Google Analytics scope.

If Google showed "This app is blocked", do NOT retry the default gcloud login.
Use a Desktop OAuth client from project $GCP_PROJECT instead (see script header).

  gcloud auth application-default login \\
    --client-id-file=migration/ga-oauth-client.json \\
    --scopes=$ADC_SCOPES

Or finish setup in the GA web UI: docs/google-analytics-setup.md
EOF
    exit 1
  fi
}

ensure_api() {
  echo "Enabling Google Analytics Admin API on $GCP_PROJECT..."
  gcloud services enable analyticsadmin.googleapis.com --project="$GCP_PROJECT" >/dev/null
}

ensure_python_deps() {
  local venv="${TMPDIR:-/tmp}/kedma-ga-admin-venv"
  if [[ ! -x "$venv/bin/python" ]]; then
    python3 -m venv "$venv"
    "$venv/bin/pip" install -q google-analytics-admin google-auth
  fi
  echo "$venv/bin/python"
}

apply_ga_config() {
  local python_bin="$1"
  MEASUREMENT_ID="$MEASUREMENT_ID" SITE_URL="$SITE_URL" "$python_bin" - <<'PY'
import os
from google.analytics.admin_v1beta import AnalyticsAdminServiceClient
from google.analytics.admin_v1beta.types import CustomDimension
from google.protobuf import field_mask_pb2

MEASUREMENT_ID = os.environ["MEASUREMENT_ID"]
SITE_URL = os.environ["SITE_URL"]

client = AnalyticsAdminServiceClient()

property_name = None
stream_name = None
current_uri = None

for summary in client.list_account_summaries():
    for prop_summary in summary.property_summaries:
        prop = prop_summary.property
        try:
            streams = client.list_data_streams(parent=prop)
        except Exception:
            continue
        for stream in streams:
            if stream.web_stream_data and stream.web_stream_data.measurement_id == MEASUREMENT_ID:
                property_name = prop
                stream_name = stream.name
                current_uri = stream.web_stream_data.default_uri
                print(f"Property: {prop_summary.display_name} ({prop})")
                print(f"Stream:   {stream.display_name}")
                print(f"ID:       {stream.web_stream_data.measurement_id}")
                print(f"URL:      {current_uri}")
                break
        if property_name:
            break
    if property_name:
        break

if not property_name:
    raise SystemExit(f"Measurement ID {MEASUREMENT_ID} not found in any accessible GA account")

if current_uri != SITE_URL:
    stream = client.get_data_stream(name=stream_name)
    stream.web_stream_data.default_uri = SITE_URL
    mask = field_mask_pb2.FieldMask(paths=["web_stream_data.default_uri"])
    updated = client.update_data_stream(data_stream=stream, update_mask=mask)
    print(f"Updated stream URL -> {updated.web_stream_data.default_uri}")
else:
    print(f"Stream URL already set to {SITE_URL}")

existing = {d.parameter_name: d.display_name for d in client.list_custom_dimensions(parent=property_name)}
for param, display in [
    ("episode_slug", "Episode slug"),
    ("episode_title", "Episode title"),
    ("audio_url", "Audio URL"),
    ("percent_listened", "Percent listened"),
    ("listen_seconds", "Listen seconds"),
]:
    if param in existing:
        print(f"Custom dimension exists: {param} ({existing[param]})")
    else:
        dim = CustomDimension(
            parameter_name=param,
            display_name=display,
            scope=CustomDimension.DimensionScope.EVENT,
        )
        created = client.create_custom_dimension(parent=property_name, custom_dimension=dim)
        print(f"Created custom dimension: {param} -> {created.name}")

print("GA4 configuration complete.")
PY
}

main() {
  require_gcloud
  ensure_api
  local python_bin
  python_bin="$(ensure_python_deps)"
  require_adc_scopes "$python_bin"
  apply_ga_config "$python_bin"
}

main "$@"
