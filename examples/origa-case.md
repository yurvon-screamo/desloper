# Case study: Origa landing (production series, 2026-09)

Source: 5 PR cycles (#537, #539, #541) over the landing content of a
Japanese-learning app — blog (en/ru/ko/vi), docs (en/ru), UI strings in Rust
(`content/{en,ru,ko,vi}.rs`), READMEs. ~70k words, 60+ files.

## What the pipeline found (before → after)

| Metric | Before | After |
|---|---|---|
| avoid-ai-writing worst file (gate 6) | 5 findings | 0–4 |
| zero-slop anki guide | 24.5 | 13.2 (gate 25) |
| zero-slop fsrs guide | 28.0 | 18.5 |
| humanizer-ru jlpt guide | 52/100 | 64/100 |
| humanizer-ru hiragana guide | 79/100 | 91/100 |
| viet-lint VI-HUM real findings | 22 | 0 (rest = FAQ "Có" FPs) |
| im-not-ai KO risk_band | low (all) | low (all; corpus was clean by metrics) |
| KO em-dash | 152 | 0 |
| VI em-dash | 134 | 0 |
| EN em-dash (worst file) | 23 | 1 (HTML comment) |
| Fact survival (numbers/URLs/links) | — | 100% across all cycles |

## Headline catches

- **P0**: an unfilled `[your language]` placeholder shipped in a public blog
  post — found by the audit, fixed in a minute.
- **Metamorphosis**: round-1 dash→period rewrites themselves created
  "not X. It's Y" contrast formulas; only the second detector (zero-slop)
  saw them. Cross-detector validation is not optional.
- **Mirror drift**: fixing hype words in RU exposed the same words still
  alive in EN/KO/VI mirrors (and later the reverse direction: VI fixes
  exposed EN/RU debt). Every fix pass ended with a mirror sweep.
- **Broken morphology invisible to detectors**: "pairedляют" (a mangled
  word from an old PR) survived every detector; only agent review caught it.
- **Genre false positives**: FAQ "Có." answers, UI button names
  (`**Remember**`), emoji flag switchers (README scored 94.9 AI-likelihood
  at evidence 20.7) — all documented in this repo's FP map instead of being
  "fixed".

## Rejected tooling (with reasons)

- lynote-ai/humanize-text — active rewriter via double NMT chain
  (EN→ZH→JA→FI→EN): destroys factual precision, needs external APIs,
  EN-only; authors themselves state the open chain has a ceiling.

## Verdict counts

Six review iterations by one reviewer agent: 3 approve cycles with all
findings fixed (final: 0 high / 0 common / 0 low). The knowledge from those
iterations is what `config/exceptions.yaml` and `docs/` encode.
