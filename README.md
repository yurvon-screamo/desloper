# desloper

Multilingual **AI-slop auditor** for content teams: scans markdown in English,
Russian, Korean, and Vietnamese; triages findings into fixable priorities vs
documented false positives; exits CI-safe.

Built from a production deslop series (5 PR cycles on a real landing page,
~70k words across 4 languages). The tool's core value is not detection —
it's **triage**: knowing what to fix, what's structural, and what's a
documented genre false positive you should leave alone.

## What it catches

| Priority | Examples |
|---|---|
| **P0** (broken) | Unfilled `[your language]` placeholders, Lorem ipsum |
| **P1** (phrase) | AI cliches ("in today's rapidly evolving…", "важно отметить", "결론적으로"), contrast formulas ("not just X, it's Y" — including the ones dash-to-period rewrites themselves create), tier-1 vocabulary (delve, leverage, seamless, tapestry) |
| **P2** (structural) | Em-dash overuse, bare-NP bullet lists, uniform sentence rhythm, bold overuse |
| **FP** (suppressed) | SEO "Brand — Descriptor" titles, FAQ "Yes." answers, UI button names in bold, numeric ranges (N5–N1), emoji flag switchers — each with a reason string |

## Quickstart

```bash
git clone https://github.com/yurvon-screamo/desloper.git
cd desloper
bun install

# Audit (built-in scanners work immediately, zero setup):
bun src/cli.ts path/to/content/

# Optional: enable RU/KO vendor scanners (2 git repos + uv venv):
bun src/cli.ts --setup
```

## CLI

```
desloper [paths...]        scan markdown files/dirs, report to stdout
desloper --setup           one-time vendor install (non-interactive)

Options:
  --json          machine-readable report (schema v1)
  --lang <l>      force language: en|ru|ko|vi (skips auto-detect)
  --setup         install vendor scanners into vendors/
  --dry-run       with --setup: print steps only
```

**Exit codes** (CI-safe):
- `0` — clean (or only suppressed FPs)
- `1` — has P0/P1 findings
- `2` — audit incomplete (scanner failures; incomplete is never "clean")
- `3` — usage error

## Scanners

| Language | Built-in (zero setup) | Vendor (after --setup) |
|---|---|---|
| EN | phrases · patterns-en (ZeroSlop 139 patterns) · metrics (4-signal lib) | avoid-ai-writing (npm, pinned) |
| RU | phrases (RU cliche dict) | humanizer-ru (genre-calibrated, 64 markers) |
| KO | phrases (KO cliche dict) | im-not-ai (deterministic KatFish metrics) |
| VI | phrases + viet-lint (43 VI-HUM patterns) | — |

The built-in `phrases` scanner works across all four languages using AI
cliche/bureaucratic dictionaries extracted from texthumanize + lists
distilled during the production series.

## Per-project false positives

Drop a `.desloper.yaml` in your content root. It layers **on top** of the
shipped `config/exceptions.yaml` (additive; never overrides global rules):

```yaml
suppress:
  - category: em-dash
    file: "**/docs/*.md"
    reason: "Technical docs: em-dash is standard here"
  - category: formatting
    quoteContains: "Remember"
    reason: "UI button name, not emphasis"
```

This repo's own `.desloper.yaml` is a live example — it suppresses the
findings desloper correctly flags in its own documentation.

## Report

Human-readable (default):

```
# desloper report
P0: 1 · P1: 8 · P2: 3 · FP: 12 · tool failures: 0

## P0 — 1
- content/blog/en/post.md [`avoid-ai-writing`/`ai-placeholder` critical]
  [your language]

## P1 — 8
- content/blog/en/post.md [`patterns-en`/`zs:contrast/its-not-its` high]
  it's not just a tool. It's
...

## Suppressed — 12
- README.md [em-dash]: SEO title convention
...
```

JSON (`--json`): schema v1 with `findings[]`, `tool_runs[]`, `summary{}`,
`language_uncertain[]`.

## Docs

- [docs/false-positives.md](docs/false-positives.md) — the FP map + known limitations
- [docs/rewrite-rules.md](docs/rewrite-rules.md) — how to fix what the audit finds
- [docs/workflow.md](docs/workflow.md) — audit → fix → fact-check loop
- [docs/mirrors.md](docs/mirrors.md) — keeping localizations in sync
- [docs/trust.md](docs/trust.md) — what --setup executes, vendor provenance
- [config/tools.yaml](config/tools.yaml) — scanner contract (SSOT)
- [config/dictionaries/README.md](config/dictionaries/README.md) — absorbed data attribution
- [examples/origa-case.md](examples/origa-case.md) — production case study

## Dependencies

**3 runtime** (all SHA-pinned, all actively maintained):

| Vendor | Role | Why kept |
|---|---|---|
| avoid-ai-writing-detector (npm) | EN detector | Gate threshold calibrated on 376-document corpus |
| ilyautov/humanizer-ru (git) | RU scanner | Genre calibration (AINL-Eval 35k texts): reduces FP from 35.9% to 4.2% |
| epoko77-ai/im-not-ai (git) | KO metrics | baseline_v2.json: 70-pattern × 14-metric calibration matrix (LLMTrace 14k texts) |

**4 absorbed** as data with attribution (see `config/dictionaries/README.md`):
texthumanize (system CLI), humanizer-skill (dormant), vietnamese-humanizer
(dormant), ZeroSlop (npx → built-in `patterns-en`).

Zero network dependencies at scan time. Content never leaves the machine.

## Development

```bash
bun test tests/          # 42 unit tests
bunx tsc --noEmit        # strict typecheck
bun src/cli.ts tests/fixtures  # e2e on golden fixtures
```

CI runs: typecheck + tests + full vendor e2e on clean runner
(exit code, per-scanner findings, all 8 scanners asserted).

## License

MIT. Absorbed data retains upstream MIT licenses
(see [third-party-licenses/](third-party-licenses/)).
