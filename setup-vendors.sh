#!/usr/bin/env bash
# desloper --setup: install vendor scanners (idempotent, non-interactive).
# Vendor map lives in config/tools.yaml; this script mirrors it.
#
# Usage: setup-vendors.sh [dry-run] [vendors-dir] [tools-yaml]
# Defaults (repo layout): false, "$ROOT/vendors", "$ROOT/config/tools.yaml".
# desloper passes explicit paths when running from a compiled binary,
# where the repo layout does not exist next to the executable.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN="${1:-false}"
VENDORS_DIR="${2:-$ROOT/vendors}"
VENDORS_YAML="${3:-$ROOT/config/tools.yaml}"

step() { echo "==> $*"; }
run() { # run <label> <cmd...> — respects DRY_RUN, never partially executes
  local label="$1"; shift
  step "$label"
  if [ "$DRY_RUN" != "true" ]; then "$@"; fi
}

# Vendors pinned to commit SHAs recorded in config/tools.yaml (SSOT).
# Setup reads pins from there; unpinned installs fail loudly.
vendor_pins() {  # emit name|url|sha lines from tools.yaml; missing sha = error
  awk '
    /^  - name:/ {name=$3}
    /^    source: git / {url=$3}
    /^    sha:/ {
      if (name == "" || url == "" || $2 !~ /^[0-9a-f]{40}$/) {
        print "ERROR: vendor entry without name/url/40-char sha: " name > "/dev/stderr"; exit 1
      }
      print name"|"url"|"$2; name=""; url=""
    }
  ' "$VENDORS_YAML"
}
# Command substitution (not process substitution) so a vendor_pins
# failure (bad pins in tools.yaml) propagates under set -e and fails
# loudly instead of silently skipping every vendor.
pins="$(vendor_pins)"
while IFS='|' read -r name repo sha; do
  [ -z "$name" ] && continue
  dir="$VENDORS_DIR/$name"
  if [ -d "$dir/.git" ]; then
    run "fetch $name @ $sha" git -C "$dir" fetch --quiet origin "$sha"
    run "pin $name @ $sha" git -C "$dir" checkout --quiet --force "$sha"
  else
    run "clone $name @ $sha" git clone --quiet "$repo" "$dir"
    run "pin $name" git -C "$dir" checkout --quiet --force "$sha"
  fi
done <<< "$pins"

step "python venv (uv) for RU/KO/VI scanners"
VENV="$VENDORS_DIR/.venv"
if [ "$DRY_RUN" != "true" ]; then
  [ -d "$VENV" ] || uv venv "$VENV" --quiet
  uv pip install --python "$VENV/bin/python" --quiet "razdel==0.5.0" "pymorphy3==2.0.6"
fi

echo "OK: vendors ready"
