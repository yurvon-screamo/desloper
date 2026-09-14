# desloper

Multilingual **AI-slop auditor**: orchestrates ready-made language detectors
(EN / RU / KO / VI) and triages their findings against a false-positive map
distilled from a production deslop series (5 PR cycles on a real landing).

The value is not another detector — it's the **triage**: what to fix (P0/P1),
what is structural (P2), and what is a documented false positive you should
leave alone (SEO title dashes, FAQ "Yes." answers, UI button names, numeric
ranges like N5–N1).

## Quickstart

```bash
bun install
bun src/cli.ts path/to/content   # built-in scanners work with zero setup
bun src/cli.ts --setup           # optional: adds RU/KO vendor scanners (2 MIT repos + uv venv)
```

Report goes to stdout; exit code is CI-safe:
`0` clean · `1` has P0/P1 findings · `2` audit incomplete (scanner failures —
an incomplete audit is never "clean"; missing binaries report the
`--setup` hint) · `3` usage error.

```bash
bun src/cli.ts content/ --json > report.json   # schema v1, machine-readable
bun src/cli.ts content/ --lang ru              # override auto-detect if unsure
```

## Scanners (config/tools.yaml is the contract)

| Language | Built-in (zero setup) | Vendor scanners (after --setup) |
|---|---|---|
| EN | phrases · metrics (humanizer-skill lib, vendored) | avoid-ai-writing (npm, pinned) · zero-slop (npx, pinned) |
| RU | phrases | humanizer-ru scan.py (genre-calibrated: docs→academic) |
| KO | phrases (series-distilled KO list) | im-not-ai deterministic shim (KatFish metrics; LLM routes never invoked) |
| VI | phrases + viet-lint (pattern catalog as data) | — |

Dead/dormant upstreams were absorbed as data with attribution
(config/dictionaries/, vendored lib) instead of staying runtime
dependencies — see tools.yaml "REMOVED VENDORS".

## Per-project false positives

Drop a `.desloper.yaml` next to your content; it layers on top of the shipped
`config/exceptions.yaml` (projects can only add/override suppression):

```yaml
suppress:
  - category: em-dash
    quoteContains: "Origa —"        # SEO title convention
    reason: "Brand — Descriptor titles, series-approved"
```

## Docs

- [docs/false-positives.md](docs/false-positives.md) — the FP map + known limitations
- [docs/rewrite-rules.md](docs/rewrite-rules.md) — how findings were fixed in production
- [docs/workflow.md](docs/workflow.md) — audit → fix → fact-check loop
- [docs/mirrors.md](docs/mirrors.md) — keeping localizations in sync
- [docs/trust.md](docs/trust.md) — what `--setup` executes and why these vendors

The scanner contract (scanner → source → language → invocation → exit
semantics) lives in [config/tools.yaml](config/tools.yaml) — it is the
single source of truth, kept next to the code it describes. The plan's
`config/dictionaries/` was deliberately dropped: vendor scanners already
carry their language dictionaries (64 RU markers, VI-HUM patterns, KatFish
metrics); a parallel desloper copy would be dead config.

## License

MIT. Vendor scanners keep their own MIT licenses (see docs/trust.md).
