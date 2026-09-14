# Workflow: audit → fix → fact-check

## 1. Audit

```bash
bun src/cli.ts content/            # human report, exit-coded
bun src/cli.ts content/ --json > before.json
```

Fix P0 first (placeholders/broken words), then P1 (phrase patterns), then P2
(structural) if the genre warrants it. Ignore suppressed findings unless the
project context changed.

## 2. Fix (human/agent)

Apply docs/rewrite-rules.md. Keep edits surgical — the series' change ratio
never exceeded a few percent of lines. If a project uses localization
mirrors, check docs/mirrors.md before committing.

## 3. Fact-check after fixing

desloper deliberately has no `diff` command (agent workflows use git diff);
use the vendor fact-checkers directly — this is the recipe that validated
100% fact survival across the series:

```bash
# EN: preservation validator (code blocks, frontmatter, URLs, headings)
node node_modules/avoid-ai-writing-detector/detector/validate.js before.md after.md

# EN: fact survival (numbers, URLs, dates, versions, acronyms)
node vendors/humanizer-skill/cli/index.js compare \
  --before before.md --after after.md --check-facts

# RU: fact-lock + cleanliness before/after (numbers, dates, names, links, code)
vendors/.venv/bin/python vendors/humanizer-ru/skills/humanizer-ru/scripts/scan.py \
  after.md --before before.md
```

Plus a plain numbers/URLs grep-diff (the series' reviewer script):
extract all numbers and URLs from both versions, diff — must be empty.

## 4. Re-audit

```bash
bun src/cli.ts content/ --json > after.json
# compare summaries; P0 must reach 0, P1 should drop below the project gate
```

## Process traps (from the series)

- Python/bun batch edits that assert can die **before writing** — always
  re-count leftovers independently (grep) after each batch.
- An incomplete audit is never "clean": desloper exits 2 on any scanner
  failure on purpose. Fix the scanner, re-run.
- Detectors do not catch broken morphology — read the changed lines once
  more before committing.
