#!/usr/bin/env bash
# desloper --setup: install vendor scanners (idempotent, non-interactive).
# Vendor map lives in config/tools.yaml; this script mirrors it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN="${1:-false}"

step() { echo "==> $*"; }
run() { # run <label> <cmd...> — respects DRY_RUN, never partially executes
  local label="$1"; shift
  step "$label"
  if [ "$DRY_RUN" != "true" ]; then "$@"; fi
}

# Vendors pinned to commit SHAs recorded in config/tools.yaml (SSOT).
# Setup reads pins from there; unpinned installs fail loudly.
VENDORS_YAML="$ROOT/config/tools.yaml"
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
while IFS='|' read -r name repo sha; do
  [ -z "$name" ] && continue
  dir="$ROOT/vendors/$name"
  if [ -d "$dir/.git" ]; then
    run "fetch $name @ $sha" git -C "$dir" fetch --quiet origin "$sha"
    run "pin $name @ $sha" git -C "$dir" checkout --quiet --force "$sha"
  else
    run "clone $name @ $sha" git clone --quiet "$repo" "$dir"
    run "pin $name" git -C "$dir" checkout --quiet --force "$sha"
  fi
done < <(vendor_pins)

step "texthumanize (system CLI, best-effort via uv tool)"
if ! command -v texthumanize >/dev/null 2>&1; then
  if [ "$DRY_RUN" = "true" ]; then
    echo "    (dry-run) would run: uv tool install texthumanize"
  else
    uv tool install texthumanize || echo "WARN: could not install texthumanize; install manually (pipx/uv tool install texthumanize)"
  fi
else
  echo "    already installed"
fi

step "python venv (uv) for RU/KO/VI scanners"
VENV="$ROOT/vendors/.venv"
if [ "$DRY_RUN" != "true" ]; then
  [ -d "$VENV" ] || uv venv "$VENV" --quiet
  uv pip install --python "$VENV/bin/python" --quiet "razdel==0.5.0" "pymorphy3==2.0.6"
  uv pip install --python "$VENV/bin/python" --quiet -e "$ROOT/vendors/vietnamese-humanizer"
fi

step "npm deps (avoid-ai-writing-detector pinned in package.json)"
run "bun install" bash -c "cd '$ROOT' && bun install"

echo "OK: vendors ready"
