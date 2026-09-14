# Trust model: what runs on your machine

## What `--setup` executes

- `git clone` (depth 1) of four MIT repositories into `vendors/` — see
  config/tools.yaml for addresses and pinned branch.
- `uv venv` + `uv pip install` of: `razdel`, `pymorphy3` (RU morphology),
  and `vietnamese-humanizer` in editable mode (`pip -e`) — which runs its
  `setup.py`. This is the standard Python distribution mechanism; review the
  repo before installing if your threat model requires it.
- `bun install` of `avoid-ai-writing-detector` (npm, version-pinned via
  package.json + bun.lock).

## What scan runs

- `texthumanize` — system CLI you installed yourself (algorithmic,
  local; desloper only ever invokes its `--detect-ai` inspect mode).
- Vendor scripts listed in config/tools.yaml. Two things desloper
  deliberately never invokes:
  - **im-not-ai LLM routes** (light/standard/heavy rewriting pipelines) —
    only the deterministic metrics shim;
  - **zero-slop hosted MCP editing** — only the local `score` command.
- Your content **never leaves the machine**: every scanner in this
  toolchain is local. (If you add a network scanner, document it here.)

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
