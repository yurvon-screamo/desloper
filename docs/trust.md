# Trust model: what runs on your machine

## What `--setup` executes

- `git clone` of four MIT repositories into `vendors/`, checked out at the
  commit SHAs recorded in config/tools.yaml (frozen pins, not branches).
- `uv tool install texthumanize` (best-effort; warns with manual
  instructions if it fails).
- `uv venv` + `uv pip install` of: `razdel==0.3.1`, `pymorphy3==2.4.5` (RU morphology),
  and `vietnamese-humanizer` in editable mode (`pip -e`) — which runs its
  `setup.py`. This is the standard Python distribution mechanism; review the
  repo before installing if your threat model requires it.
- `bun install` of `avoid-ai-writing-detector` (npm, version-pinned via
  package.json + bun.lock).

## What scan runs

- `texthumanize` — algorithmic local CLI (installed by `--setup` via
  `uv tool` when possible; desloper only ever invokes its `--detect-ai`
  inspect mode).
- Vendor scripts listed in config/tools.yaml. Two things desloper
  deliberately never invokes:
  - **im-not-ai LLM routes** (light/standard/heavy rewriting pipelines) —
    only the deterministic metrics shim;
  - **zero-slop hosted MCP editing** — only the local `score` command.
- Your content does not leave the machine. One network caveat:
  **zero-slop is fetched via `npx --yes zero-slop@2.12.1` at scan time**
  (version-pinned, but the package itself downloads from the npm registry
  on first use and during availability checks). If that matters for your
  threat model, pre-install it or vendor the package. All other scanners
  are fully local, including texthumanize (algorithmic, no model download).

## Vendor provenance

| Vendor | License | Series usage |
|---|---|---|
| Aboudjem/humanizer-skill | MIT | EN metrics + fact-compare |
| ilyautov/humanizer-ru | MIT | RU 64-marker scanner (genre-calibrated) |
| epoko77-ai/im-not-ai | MIT | KO deterministic KatFish metrics |
| longhang2004/vietnamese-humanizer | MIT | VI surface linter |
| avoid-ai-writing-detector (npm) | MIT | EN deterministic detector |
| zero-slop (npx) | MIT | EN 294-pattern scorer (local mode) |

All were exercised on production content during the source series before
being vendored here.
