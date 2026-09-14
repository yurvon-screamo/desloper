#!/usr/bin/env bash
# desloper --setup: install vendor scanners (idempotent, non-interactive).
# Vendor map lives in config/tools.yaml; this script mirrors it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRY_RUN="${1:-false}"

step() { echo "==> $*"; }

vendors=(
  # name|repo|rev
  "humanizer-skill|https://github.com/Aboudjem/humanizer-skill|main"
  "humanizer-ru|https://github.com/ilyautov/humanizer-ru|main"
  "im-not-ai|https://github.com/epoko77-ai/im-not-ai|main"
  "vietnamese-humanizer|https://github.com/longhang2004/vietnamese-humanizer|main"
)

for v in "${vendors[@]}"; do
  IFS='|' read -r name repo rev <<< "$v"
  dir="$ROOT/vendors/$name"
  if [ -d "$dir/.git" ]; then
    step "update $name"
    [ "$DRY_RUN" = "true" ] || git -C "$dir" fetch --quiet && git -C "$dir" checkout --quiet "$rev" && git -C "$dir" reset --quiet --hard "origin/$rev"
  else
    step "clone $name ($rev)"
    [ "$DRY_RUN" = "true" ] || git clone --quiet --depth 1 --branch "$rev" "$repo" "$dir"
  fi
done

step "python venv (uv) for RU/KO/VI scanners"
VENV="$ROOT/vendors/.venv"
if [ "$DRY_RUN" != "true" ]; then
  [ -d "$VENV" ] || uv venv "$VENV" --quiet
  uv pip install --python "$VENV/bin/python" --quiet razdel pymorphy3
  uv pip install --python "$VENV/bin/python" --quiet -e "$ROOT/vendors/vietnamese-humanizer"
fi

step "npm deps (avoid-ai-writing-detector pinned in package.json)"
[ "$DRY_RUN" = "true" ] || (cd "$ROOT" && bun install --silent)

echo "OK: vendors ready"
