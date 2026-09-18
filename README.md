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
                  (compiled binaries: platform data dir — see "Binary
                  distribution" below; DESLOPER_VENDORS overrides)
  --dry-run       with --setup: print steps only
```

`--setup` requires `git`, `uv` and `bash` on PATH (EN scanning needs
none of them — it ships in-process).

**Exit codes** (CI-safe):
- `0` — clean (or only suppressed FPs)
- `1` — has P0/P1 findings
- `2` — audit incomplete (scanner failures; incomplete is never "clean")
- `3` — usage error

## Scanners

| Language | Built-in (zero setup) | Vendor (after --setup) |
|---|---|---|
| EN | phrases · patterns-en (ZeroSlop 139 patterns) · metrics (4-signal lib) · avoid-ai-writing (in-process) | — |
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

## Binary distribution

Build self-contained executables (no Bun or Node on the target machine):

```bash
bun run build                    # full matrix → dist/
bun src/build.ts bun-linux-x64   # single target
```

Every built-in scanner ships inside the binary, including the in-process
EN detector. RU/KO vendor scanners install on demand: `desloper --setup`
puts them under the platform data dir — `~/.local/share/desloper/vendors`
on Linux (XDG_DATA_HOME honored), `~/Library/Application Support/desloper/vendors`
on macOS (override anywhere with `DESLOPER_VENDORS`; needs `git`, `uv`, `bash`).

macOS Gatekeeper quarantines unsigned downloaded binaries — allow in
System Settings, or `xattr -d com.apple.quarantine desloper-*-darwin-arm64`.
The binary bundles MIT-licensed third-party code (avoid-ai-writing-detector);
upstream license notices ship in
[third-party-licenses/](third-party-licenses/).

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

**2 runtime vendors** (git-pinned, actively maintained):

| Vendor | Role | Why kept |
|---|---|---|
| ilyautov/humanizer-ru (git) | RU scanner | Genre calibration (AINL-Eval 35k texts): reduces FP from 35.9% to 4.2% |
| epoko77-ai/im-not-ai (git) | KO metrics | baseline_v2.json: 70-pattern × 14-metric calibration matrix (LLMTrace 14k texts) |

The EN detector (avoid-ai-writing-detector, npm, MIT) runs **in-process**:
imported via its `analyzeText()` API and bundled at build time — no runtime
Node needed. Its gate threshold was calibrated on a 376-document corpus, and
a golden-diff test pins the adapter to deep-equal (structural) output of the
upstream CLI.

**4 absorbed** as data with attribution (see `config/dictionaries/README.md`):
texthumanize (system CLI), humanizer-skill (dormant), vietnamese-humanizer
(dormant), ZeroSlop (npx → built-in `patterns-en`).

Zero network dependencies at scan time. Content never leaves the machine.

## Development

```bash
bun test tests/          # 47 unit tests
bunx tsc --noEmit        # strict typecheck
bun src/cli.ts tests/fixtures  # e2e on golden fixtures
bun run build            # compiled binaries → dist/
```

CI runs: typecheck + tests + full vendor e2e (exit code, per-scanner
findings, all 8 scanners asserted) + build matrix with native smoke +
clean-room artifact e2e (binary provisions its own vendors).

## License

MIT. Absorbed data retains upstream MIT licenses
(see [third-party-licenses/](third-party-licenses/)).
