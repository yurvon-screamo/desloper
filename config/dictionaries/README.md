# Embedded dictionaries — attribution

| File | Extracted from | License | Notes |
|---|---|---|---|
| texthumanize-dicts.json | texthumanize (lang packs: AI cliches, bureaucratic phrases, AI connectors for en/ru/ko/vi) | MIT | extracted via the package's own LANGUAGES API at absorption time; KO/VI cliche lists topped up from the production deslop series |
| vi-patterns.json | longhang2004/vietnamese-humanizer patterns/{humanizer,style,grammar,translationese}.yml @ 611c6e9 | MIT | full pattern catalog incl. severity/confidence taxonomy; upstream dormant |
| ja-patterns.json | textlint-ja/textlint-rule-preset-ai-writing src/rules @ 45bb648 | MIT | 4 of 5 rules absorbed as data (emoji/bold-list formatting, emphasis patterns, hype expressions). NOT absorbed: no-ai-colon-continuation (kuromojin parser dependency; translationese lane is covered by the natural-japanese vendor) and ai-tech-writing-guideline (subjective advice, FP-prone on human text). Hype entries already covered by the phrases scanner (SERIES_CLICHES.ja: 革命的, ゲームチェンジャー, 世界初, 魔法のように, 奇跡的な, 業界を再定義, 未来を変える, パラダイムシフト, 次世代の) are not duplicated in the catalog. Corpus-informed exclusions from SERIES_CLICHES.ja: 最後に/まさに are human-frequency words (coji/natural-japanese calibration: 63% of that corpus's false positives). |
| zero-slop-patterns.json | manavmishra/ZeroSlop data/patterns.json @ 2.12.1 | MIT | 139/273 patterns (contrast/scaffolding/hedging/marketing/puffery/drama/linkedin/filler/verbs) + 95-word lexicon; filtered to production-validated categories |
| es-patterns.json | dorelysm/naturalizacion-texto-es SUBSTITUTIONS.md @ 7eaba75 | MIT | Tiers 1/3/4 converted to regex rules (pomposity frames, conclusion announcers, paragraph connectors); Tier 2 vocabulary lives in phrase.ts SERIES_WEAK.es (weak class — ordinary words, FP-safe only in repetition); "fundamental" excluded from Tier 2 (dedup: the frame "Es fundamental que" carries it in es:pomposity_frame). No corpus calibration — thresholds provisional, see docs/false-positives.md. |
| (vendored lib) | Aboudjem/humanizer-skill cli/lib @ a58df06 | MIT | src/scanners/{metrics,vocabulary,tokenize}.js — dependency-free, unmodified |

Dead/dormant upstreams are absorbed as data so desloper carries no runtime
dependency on them. If an upstream revives, re-extract and refresh here.
