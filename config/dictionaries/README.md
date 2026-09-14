# Embedded dictionaries — attribution

| File | Extracted from | License | Notes |
|---|---|---|---|
| texthumanize-dicts.json | texthumanize (lang packs: AI cliches, bureaucratic phrases, AI connectors for en/ru/ko/vi) | MIT | extracted via the package's own LANGUAGES API at absorption time; KO/VI cliche lists topped up from the production deslop series |
| vi-patterns.json | longhang2004/vietnamese-humanizer patterns/{humanizer,style,grammar,translationese}.yml @ 611c6e9 | MIT | full pattern catalog incl. severity/confidence taxonomy; upstream dormant |
| (vendored lib) | Aboudjem/humanizer-skill cli/lib @ a58df06 | MIT | src/scanners/{metrics,vocabulary,tokenize}.js — dependency-free, unmodified |

Dead/dormant upstreams are absorbed as data so desloper carries no runtime
dependency on them. If an upstream revives, re-extract and refresh here.
