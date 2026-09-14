# Mirrors: keeping localizations in sync

When content exists in several locales (EN/RU/KO/VI files of the same page),
every fix in one locale creates debt in the others. The series' reviewer
tracked this with a sync table; the discipline is:

1. **Fix one locale**, then immediately check the same passage in every
   mirror before committing. Examples that actually drifted in production:
   - `huge library` fixed to `large` in EN while RU («огромная»), KO
     («거대한»), VI («khổng lồ») still carried the hype word;
   - a praise triad ("great ×3") de-slopped in VI while EN/RU kept it.

2. **Parity set for deliberate leftovers.** Some patterns must stay
   identical across locales — record them:
   - SEO meta-titles `Brand — Descriptor`
   - UI labels (`Using both —` / «Использование обоих —» / «함께 사용하기 —» /
     «Sử dụng cả hai —»)
   - number formats, version strings, file names

3. **Translationese is locale-specific.** The same EN em-dash renders as a
   dash-calque in KO/VI (purge) but is standard punctuation in RU (keep).
   Do not apply one locale's dash policy to another.

4. **Quick mirror check:** for each fixed string, grep the canonical token
   (product name, number) across all locale files and eyeball the same
   sentence in each.
