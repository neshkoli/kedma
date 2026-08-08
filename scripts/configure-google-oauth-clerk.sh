#!/usr/bin/env bash
# Configure Google OAuth for Clerk production (kedma-podcast GCP project).
#
# Standard Web OAuth clients (*.apps.googleusercontent.com) cannot be created
# via gcloud — only through Google Auth Platform in Cloud Console.
#
# Usage:
#   ./scripts/configure-google-oauth-clerk.sh              # print values + open Console
#   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ./scripts/configure-google-oauth-clerk.sh apply

set -euo pipefail

GCP_PROJECT="${GCP_PROJECT:-kedma-podcast}"
CLERK_PROD_CALLBACK="https://clerk.kedma.xyz/v1/oauth_callback"
CLERK_DEV_CALLBACK="https://great-unicorn-5.clerk.accounts.dev/v1/oauth_callback"

REDIRECT_URIS=(
  "$CLERK_PROD_CALLBACK"
  "$CLERK_DEV_CALLBACK"
)

JS_ORIGINS=(
  "https://www.kedma.xyz"
  "https://kedma.xyz"
  "http://localhost:4321"
)

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
}

print_console_values() {
  echo "GCP project: $GCP_PROJECT"
  echo
  echo "1) OAuth consent screen (if not done yet):"
  echo "   https://console.cloud.google.com/auth/overview?project=$GCP_PROJECT"
  echo "   - User type: External"
  echo "   - App name: Kedma"
  echo "   - Scopes: openid, email, profile (or .../auth/userinfo.email + profile)"
  echo
  echo "2) Create OAuth client (Web application):"
  echo "   https://console.cloud.google.com/auth/clients/create?project=$GCP_PROJECT"
  echo "   - Name: Kedma Clerk"
  echo "   - Authorized redirect URIs:"
  for uri in "${REDIRECT_URIS[@]}"; do
    echo "       $uri"
  done
  echo "   - Authorized JavaScript origins:"
  for origin in "${JS_ORIGINS[@]}"; do
    echo "       $origin"
  done
  echo
  echo "3) Copy Client ID and Client Secret from the creation dialog, then run:"
  echo "   GOOGLE_CLIENT_ID='...apps.googleusercontent.com' \\"
  echo "   GOOGLE_CLIENT_SECRET='GOCSPX-...' \\"
  echo "   ./scripts/configure-google-oauth-clerk.sh apply"
}

apply_to_clerk() {
  command -v clerk >/dev/null || {
    echo "Install Clerk CLI: https://clerk.com/docs/reference/cli" >&2
    exit 1
  }

  if [[ -z "${GOOGLE_CLIENT_ID:-}" || -z "${GOOGLE_CLIENT_SECRET:-}" ]]; then
    echo "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET" >&2
    exit 1
  fi

  if [[ ! "$GOOGLE_CLIENT_ID" =~ \.apps\.googleusercontent\.com$ ]]; then
    echo "Client ID must end with .apps.googleusercontent.com (Console Web client, not gcloud iam oauth-clients)" >&2
    exit 1
  fi

  patch_json=$(GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" python3 - <<'PY'
import json, os
print(json.dumps({
  "connection_oauth_google": {
    "enabled": True,
    "client_id": os.environ["GOOGLE_CLIENT_ID"],
    "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
  }
}))
PY
)

  echo "Patching Clerk production Google OAuth..."
  clerk config patch --instance prod --json "$patch_json" --yes
  echo
  echo "Deploy status:"
  clerk deploy status
}

open_console() {
  if command -v open >/dev/null; then
    open "https://console.cloud.google.com/auth/clients/create?project=$GCP_PROJECT"
  fi
}

main() {
  require_gcloud
  case "${1:-}" in
    apply) apply_to_clerk ;;
    *)
      print_console_values
      open_console
      ;;
  esac
}

main "$@"
