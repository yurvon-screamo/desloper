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
bun src/cli.ts --setup     # one-time: clone MIT vendors + uv venv (non-interactive)
bun src/cli.ts path/to/content
```

Report goes to stdout; exit code is CI-safe:
`0` clean · `1` has P0/P1 findings · `2` audit incomplete (scanner failures —
an incomplete audit is never "clean") · `3` usage/vendors missing.

```bash
bun src/cli.ts content/ --json > report.json   # schema v1, machine-readable
bun src/cli.ts content/ --lang ru              # override auto-detect if unsure
```

## Scanners (config/tools.yaml is the contract)

| Language | Scanners |
|---|---|
| EN | texthumanize (inspect-only) · avoid-ai-writing-detector (npm, pinned) · zero-slop (npx, pinned) · humanizer-skill (vendor) |
| RU | humanizer-ru scan.py (genre-calibrated: docs→academic) · texthumanize |
| KO | im-not-ai deterministic shim (KatFish metrics; LLM routes never invoked) · texthumanize |
| VI | viet-writing-lint (vietnamese-humanizer) · texthumanize |

Known trap covered: texthumanize's auto language detect confuses Vietnamese
with French — desloper always passes an explicit language.

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

- [docs/tool-map.md](docs/tool-map.md) — the scanner contract
- [docs/false-positives.md](docs/false-positives.md) — the FP map + known limitations
- [docs/rewrite-rules.md](docs/rewrite-rules.md) — how findings were fixed in production
- [docs/workflow.md](docs/workflow.md) — audit → fix → fact-check loop
- [docs/mirrors.md](docs/mirrors.md) — keeping localizations in sync
- [docs/trust.md](docs/trust.md) — what `--setup` executes and why these vendors
- [examples/origa-case.md](examples/origa-case.md) — production case study with metrics

## License

MIT. Vendor scanners keep their own MIT licenses (see docs/trust.md).
