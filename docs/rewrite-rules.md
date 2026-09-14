# Rewrite rules (how findings were fixed in production)

The audit reports; fixes stay human/agent-driven. These rules were applied
across 5 production PR cycles and validated by before/after fact-checks.

## Em-dash (EN; KO/VI translationese)

Budget ≈ 1 per 300 words. Replacement is **semantic, not mechanical**:

| Shape | Replacement |
|---|---|
| single, second clause is consequence/definition | period `.` |
| single, appositive/gloss | comma `,` or colon after a complete clause |
| paired (— aside —) | parentheses |
| label (`**X** — description`) | colon (`**X:** description`) |
| list of link + description | colon |

**Meta-trap:** dash→period rewrites *create* the "not X. It's Y" contrast
formula — which only cross-detector validation catches (zero-slop in this
toolchain). Always re-run the audit after rewriting.

**Translationese (KO/VI):** translated Korean/Vietnamese carries 14–20 em-dashes
per file where authentic prose uses ~0. Same replacement table applies; keep
SEO meta-titles and UI labels (locale parity).

## Vocabulary (tier1)

EN: landscape→field/space, comprehensive→(drop), serves as→is, unmatched→scoped
factual claim, huge/enormous→large, genuinely→(drop), "the whole point"→(drop).
RU: важно понимать→у неё есть границы / у инструмента своё место; огромный→
большой/целая; «Подводя итог»→(drop); комплексный→(drop). KO: 거대한→큰,
훌륭한(great)→좋은(good), 으로의/에서의 double particles→restructure,
에 의해 passive→active. VI: không chỉ… mà còn→direct statement, tuyệt vời→tốt,
khổng lồ→lớn, toàn diện→(drop).

## Structure

- Bare-NP bullet lists → prose (unless parameter docs)
- Forced triads → real count of items
- Transitions (Moreover/Furthermore/В заключение/Hơn nữa/또한 3+) → cut or restructure
- Formulaic conclusions → concrete closing statement or cut

## Never touch

Facts, numbers, URLs, product names, JLPT levels, quoted strings, legal text,
code, dates. Verify with the fact-check recipe in workflow.md after every pass.
