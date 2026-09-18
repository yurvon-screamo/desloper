#!/usr/bin/env bash
# Shared golden-audit assertions for the CI e2e and artifact-e2e jobs.
# Usage: assert-golden-audit.sh <report.json> <exit-code>
set -euo pipefail

report="$1"
ec="$2"

jq '.summary' "$report"
# Exit policy: findings present (p0+p1 > 0) must yield exit 1.
test "$ec" -eq 1
jq -e '.summary.tool_failures == 0' "$report"
jq -e '.summary.p0 == 2' "$report"
# Every scanner must produce at least one finding on the fixtures
# (regressions to zero-findings must fail CI).
for t in desloper phrases avoid-ai-writing patterns-en metrics humanizer-ru im-not-ai viet-lint; do
  jq -e --arg t "$t" '[.tool_runs[] | select(.tool==$t) | .findings] | add >= 1' "$report"
done
jq -e '.language_uncertain | type == "array"' "$report"
