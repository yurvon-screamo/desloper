# False-positive map

Distilled from 3 review iterations of a production deslop series. These
suppressions live in `config/exceptions.yaml` (global) and can be layered
per-project via `.desloper.yaml`.

## Genre / domain

| Signal | Why it's a false positive |
|---|---|
| `**Remember**` / `**Know**` bold patterns | UI button names (spaced-repetition apps rate cards), not emphasis |
| "the lesson is" / "the next chapter" | Literal domain usage (a lesson app), detectors expect the metaphor |
| `N5 → N1` arrows | Progression notation in docs, not decorative arrows |
| Emoji country flags 🇬🇧🇷🇺🇰🇷 | README language switchers; inflates emoji-decor scores at low evidence |
| Low TTR on domain corpora | Terminology (card/review/deck) dominates; not vocabulary poverty |
| Bare-NP bullet lists in CLI references | Parameter docs are the correct format for option lists |
| FAQ answers "Có." / "Yes." | Answer convention; mirrors EN "Yes." |
| Long dash in Russian | Standard Russian punctuation, unlike English; never purge by EN rules |
| En-dash in numeric ranges | `N5–N1`, `30–45 minutes` — typographic norm |
| `meta_title` dashes | SEO convention "Brand — Descriptor" (kept in EN mirrors too) |
| Formal register in reference docs | Genre, not slop; detectors' "formal/academic style" flags are noise on docs |

## Known limitations (by design)

- **ru-structural fragment leads.** Only stubs under 35 chars opening a
  100+ char body (or standalone stub paragraphs before a substantial
  one) flag; mid-sized leads (35–100 chars) are a known blind spot.
  The stub→body adjacency requires exactly one blank line: a double
  blank between stub and body conservatively breaks the lead relation.
  One-word run-in labels ("Методика.") and short closing paragraphs
  stay clean by design. Two-word stubs like "Это важно." before a long
  body DO flag — suppress per-project if that fits your genre. Reference
  stubs ("См. следующий раздел.") — the most common lead in RU technical
  docs — flag too: per-project suppression is expected for docs-genre
  content.
- **ru-structural dash density.** Threshold 3 per paragraph flags
  legitimate RU definition chains ("X — это Y. A — B, C — D") in some
  genres. The finding quote carries the paragraph excerpt, so per-project
  `quoteContains` suppression can target specific paragraphs; suppress
  the whole category only for dash-heavy genres.
- **ru-structural arrows.** Digit-flanked progressions ("N5 → N1",
  "30 → 50") are exempt (token-based, so "(N5) → N1" is exempt too).
  Remaining FP classes: purely numeric/alphanumeric chains ("1 → 2 → 3",
  "A1 → A2") no longer flag by the same exemption, and punctuation tight
  to the digit is part of the token (also exempt). Arrows inside list
  items are not scanned (semi-structural; often progression notation).
- **Vendor-side suppression is not resurrectable.** Genre calibration
  (humanizer-ru `--genre`, viet-lint taxonomy) runs inside the wrapper;
  desloper suppression can only downgrade further. In a project with an
  unusual genre, vendor calibration may hide real issues — override with
  per-project config or run the vendor directly.
- **Detectors do not catch broken morphology.** A mangled word
  ("pairedляют") survived every detector in the series; only agent review
  caught it. The audit is a floor, not a ceiling.
- **Scores are probabilistic surface meters.** High `ai_likelihood` with low
  evidence = genre artifact (e.g. emoji-heavy README scoring 94.9 at evidence
  20.7). desloper reports both.
- **EN detector runs without a per-file timeout.** The former subprocess
  call had a 30s kill; the in-process `analyzeText()` is synchronous and
  unbounded. Deterministic pattern scan, never hung in the production
  series — if it ever does, the escalation is a Worker wrapper.
- **Invalid UTF-8 is scanned, not failed, by the EN detector.** The former
  subprocess hard-failed non-UTF-8 files (audit incomplete); in-process
  text arrives replacement-decoded, so the audit continues on degraded
  text. Finding counts on such files may differ from the upstream CLI.
- **JA false-positive map is provisional.** Unlike EN/RU/KO/VI, the JA
  dictionaries were not yet exercised on a real content corpus — the
  cliche list is curated from corpus research (coji/natural-japanese
  calibration, 137 human / 406 AI texts) and MIT-licensed catalogs, not
  from production deslop rounds. Expect the JA FP map to grow as real
  content is audited; the 最後に/まさに exclusion (human-frequency words,
  63% of the calibration corpus's false positives) is the one documented
  trap so far. The P0 placeholder scanner also stays EN-convention
  ([your …], INSERT, Lorem ipsum): JA templates use the same conventions,
  and 【ここに…】 patterns would false-positive on legitimate JA docs.
- **JA lexicon overlaps across scanners, by design.** Markers like
  することが可能 or に他ならない exist both in the phrases dictionaries
  and in the natural-japanese vendor's translationese/forbidden lists —
  the same text can yield two findings with different priorities (RU
  lives with the same overlap). Findings are not deduped across tools;
  the report shows each tool's evidence separately.
- **JA vendor lint exits 0 by design.** natural-japanese `lint.py` is a
  lint, not a gate: it exits 0 regardless of finding count (1 only on
  input errors). desloper therefore treats a nonzero exit OR unparseable
  JSON as a tool failure (audit incomplete, exit 2) — a "clean" JA file
  is always backed by parsed findings, never by an exit code.
- **ja-lint formatting rules are line-scoped.** The upstream textlint
  preset evaluates AST nodes (ListItem/Header); the absorbed data
  matches markdown line shapes instead. A list item split across two
  physical lines, or bold spanning lines, can be missed. Deterministic
  and conservative — no FP direction risk, only recall loss.
