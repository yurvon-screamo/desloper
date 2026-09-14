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

# Vendors pinned to commit SHAs (see docs/trust.md: floating branch is not a pin).
vendors=(
  # name|repo|sha
  "humanizer-skill|https://github.com/Aboudjem/humanizer-skill|PIN_ME"
  "humanizer-ru|https://github.com/ilyautov/humanizer-ru|PIN_ME"
  "im-not-ai|https://github.com/epoko77-ai/im-not-ai|PIN_ME"
  "vietnamese-humanizer|https://github.com/longhang2004/vietnamese-humanizer|PIN_ME"
)

for v in "${vendors[@]}"; do
  IFS='|' read -r name repo sha <<< "$v"
  dir="$ROOT/vendors/$name"
  if [ "$sha" = "PIN_ME" ]; then
    # Resolve HEAD once at setup time and freeze it in place for this clone.
    if [ ! -f "$dir/.desloper-pin" ]; then
      step "resolve HEAD for $name (pinned on first setup)"
      if [ "$DRY_RUN" != "true" ]; then
        if [ ! -d "$dir/.git" ]; then git clone --quiet "$repo" "$dir"; fi
        git -C "$dir" rev-parse HEAD > "$dir/.desloper-pin"
      fi
    fi
    [ -f "$dir/.desloper-pin" ] && sha="$(cat "$dir/.desloper-pin")"
  fi
  if [ -d "$dir/.git" ]; then
    run "update $name @ $sha" git -C "$dir" fetch --quiet origin "$sha"
    run "checkout $name @ $sha" git -C "$dir" checkout --quiet --force "$sha"
  else
    run "clone $name @ $sha" git clone --quiet "$repo" "$dir"
    run "pin $name" git -C "$dir" checkout --quiet --force "$sha"
  fi
done

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
  uv pip install --python "$VENV/bin/python" --quiet "razdel==0.3.1" "pymorphy3==2.4.5" || \
    uv pip install --python "$VENV/bin/python" --quiet razdel pymorphy3
  uv pip install --python "$VENV/bin/python" --quiet -e "$ROOT/vendors/vietnamese-humanizer"
fi

step "npm deps (avoid-ai-writing-detector pinned in package.json)"
run "bun install" bash -c "cd '$ROOT' && bun install"

echo "OK: vendors ready"
