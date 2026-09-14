# Trust model: what runs on your machine

## What `--setup` executes

- `git clone` of two actively-maintained MIT repositories into `vendors/`
  (humanizer-ru, im-not-ai), checked out at the commit SHAs recorded in
  config/tools.yaml (frozen pins, not branches).
- `uv venv` + `uv pip install` of `razdel==0.5.0` and `pymorphy3==2.0.6`
  (RU morphology). No editable installs.
- `bun install` of `avoid-ai-writing-detector` (npm, version-pinned via
  package.json + bun.lock).

## What scan runs

- Built-in scanners (phrases / metrics / viet-lint / desloper P0): pure
  local data + code, zero subprocess, zero network.
- Vendor scripts listed in config/tools.yaml. Two things desloper
  deliberately never invokes:
  - **im-not-ai LLM routes** (light/standard/heavy rewriting pipelines) —
    only the deterministic metrics shim;
  - **zero-slop hosted MCP editing** — only the local `score` command.
- Your content does not leave the machine. All scanners are fully local —
  zero-slop's npx fetch was removed when its patterns were absorbed as
  data (config/dictionaries/zero-slop-patterns.json).

## Vendor provenance

| Source | License | Status | What we took |
|---|---|---|---|
| ilyautov/humanizer-ru | MIT | active vendor | live scanner (genre-calibrated) |
| epoko77-ai/im-not-ai | MIT | active vendor | live deterministic shim |
| avoid-ai-writing-detector (npm) | MIT | pinned dep | live detector |
| zero-slop (npx) | MIT | pinned dep | live scorer (local mode) |
| texthumanize | MIT | absorbed | cliche/bureaucratic dictionaries → config/dictionaries/ |
| Aboudjem/humanizer-skill | MIT | absorbed (dormant) | metrics/vocabulary/tokenize.js vendored into src/scanners/ |
| longhang2004/vietnamese-humanizer | MIT | absorbed (dormant) | pattern catalog → vi-patterns.json |

Every absorbed artifact retains its MIT license and attribution; all were
exercised on production content during the source series before being
absorbed.
