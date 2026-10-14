# Trust model: what runs on your machine

## What `--setup` executes

- `git clone` of three actively-maintained MIT repositories
  (humanizer-ru, im-not-ai, natural-japanese), checked out at the commit
  SHAs recorded in config/tools.yaml (frozen pins, not branches).
- `uv venv` + `uv pip install` of `razdel==0.5.0` and `pymorphy3==2.0.6`
  (RU morphology) plus `sudachipy==0.7.0` and
  `sudachidict-core==20260723.1` (JA morphological analysis). No editable
  installs.

Vendors land in the repo `vendors/` directory (dev checkout),
`$DESLOPER_VENDORS` when set, or the platform data dir for compiled
binaries (`~/.local/share/desloper/vendors` on Linux with
`XDG_DATA_HOME` honored, `~/Library/Application Support/desloper/vendors`
on macOS). Requires `git`, `uv` and `bash` on PATH.

## What scan runs

- Built-in scanners (phrases / patterns-en / metrics / viet-lint /
  avoid-ai-writing / desloper P0): pure local data + code, zero
  subprocess, zero network.
- Vendor scripts listed in config/tools.yaml. Things desloper
  deliberately never invokes:
  - **im-not-ai LLM routes** (light/standard/heavy rewriting pipelines) —
    only the deterministic metrics shim;
  - **natural-japanese LLM rewrite skill** (SKILL.md pipeline) — only the
    deterministic `lint.py` detectors;
  - **zero-slop hosted MCP editing** — only the local `score` command.
- Your content does not leave the machine. All scanners are fully local —
  zero-slop's npx fetch was removed when its patterns were absorbed as
  data (config/dictionaries/zero-slop-patterns.json).

## Vendor provenance

| Source | License | Status | What we took |
|---|---|---|---|
| ilyautov/humanizer-ru | MIT | active vendor | live scanner (genre-calibrated) |
| epoko77-ai/im-not-ai | MIT | active vendor | live deterministic shim |
| coji/natural-japanese | MIT | active vendor | live deterministic lint.py (corpus-calibrated JA detectors) |
| avoid-ai-writing-detector (npm) | MIT | in-process dep | live detector (analyzeText, no subprocess) |
| zero-slop (npx) | MIT | pinned dep | live scorer (local mode) |
| texthumanize | MIT | absorbed | cliche/bureaucratic dictionaries → config/dictionaries/ |
| Aboudjem/humanizer-skill | MIT | absorbed (dormant) | metrics/vocabulary/tokenize.js vendored into src/scanners/ |
| longhang2004/vietnamese-humanizer | MIT | absorbed (dormant) | pattern catalog → vi-patterns.json |
| textlint-ja/textlint-rule-preset-ai-writing | MIT | absorbed (active upstream) | pattern catalog → ja-patterns.json |

Every absorbed artifact retains its MIT license and attribution; all were
exercised on production content during the source series before being
absorbed.
