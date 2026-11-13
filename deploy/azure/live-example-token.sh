#!/usr/bin/env bash
# ============================================================
# Give the live example a read-only GitHub token
# ============================================================
# GitHub serves GitHub Actions job logs only to authenticated
# requests, even for public repositories, and caps anonymous API use
# at 60 requests an hour. The live example reads northwind-commerce's
# runs and logs, so it needs a token of its own: fine-grained,
# read-only, limited to that one repository.
#
# This prints what to create on GitHub, takes the token in a hidden
# prompt, stores it as the GH_SYNC_TOKEN repository secret (passed
# straight to GitHub, never written to disk) and redeploys. Run it in
# Azure Cloud Shell, or anywhere `gh` is signed in:
#
#   bash CodeLens/deploy/azure/live-example-token.sh
# ============================================================
set -euo pipefail

EXAMPLE_REPO="${EXAMPLE_REPO:-ShravanJanwade/northwind-commerce}"
WORKFLOW_FILE="deploy-azure.yml"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31merror: %s\033[0m\n' "$*" >&2; exit 1; }

GITHUB_REPO="${GITHUB_REPO:-$(git -C "$repo_root" remote get-url origin 2>/dev/null |
  sed -E 's#^https://([^/@]+@)?github\.com/##; s#^git@github\.com:##; s#\.git$##; s#/$##')}"
case "$GITHUB_REPO" in
  */*) ;;
  *) fail "Could not tell which GitHub repository this is. Re-run with GITHUB_REPO=owner/name." ;;
esac
if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  fail "GitHub CLI is not signed in. Run 'gh auth login' first."
fi

step "Create a fine-grained token on GitHub"
cat <<EOF
    Open https://github.com/settings/personal-access-tokens/new and fill in:

      Token name         CodeLens live example
      Expiration         one year (or no expiration, if offered)
      Repository access  Only select repositories: ${EXAMPLE_REPO}
      Permissions        Actions: Read-only
                         Contents: Read-only
                         Deployments: Read-only
                         (Metadata: Read-only is added automatically)

    Generate it and copy the value. It cannot change anything; it can only
    read that one repository's runs, logs, files and deployments.
EOF

step "Paste the token (input is hidden)"
read -r -s -p "    Token: " token
echo
[ -n "$token" ] || fail "No token entered."
case "$token" in
  github_pat_* | ghp_*) ;;
  *) fail "That does not look like a GitHub token (they start with github_pat_ or ghp_)." ;;
esac

step "Checking it can read ${EXAMPLE_REPO}'s runs"
status="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" \
  -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/${EXAMPLE_REPO}/actions/runs?per_page=1")"
[ "$status" = "200" ] || fail "GitHub answered $status. Check the repository access and the Actions permission."

step "Storing it as GH_SYNC_TOKEN on ${GITHUB_REPO}"
printf '%s' "$token" | gh secret set GH_SYNC_TOKEN --repo "$GITHUB_REPO"
unset token

step "Redeploying so the app picks it up"
gh workflow run "$WORKFLOW_FILE" --repo "$GITHUB_REPO"
sleep 5
run_id="$(gh run list --repo "$GITHUB_REPO" --workflow "$WORKFLOW_FILE" --limit 1 --json databaseId --jq '.[0].databaseId')"
[ -n "$run_id" ] && gh run watch "$run_id" --repo "$GITHUB_REPO" --exit-status || true
printf '\nDone. Open the live example at /live; the first visit syncs the runs.\n'
