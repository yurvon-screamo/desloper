import type { Lang } from "./scanners/types.ts";

/**
 * Detect the dominant language of a file: by path segment first
 * (locale directories like content/ru/, blog/en/), then by script —
 * or, for the script-sharing Latin languages (en/es/pt), by function
 * word frequency. Known trap covered upstream: texthumanize misdetects
 * vi as fr on auto, so desloper always passes an explicit --lang; when
 * detection is inconclusive we default to "en" and let the report note
 * the uncertainty (mixed-language files keep EN tools + note).
 */

// Spanish shares the Latin script with EN/PT, so its content branch is
// frequency-based. The stopword list is ES function words that EN lacks
// as function words — homographs like "real", "arena", "con" are
// deliberately excluded (they would flip EN files into the es bucket),
// and toponym leftovers ("Los Angeles", "Del Rio") stay harmless under
// the ratio guards. Lookaround boundaries instead of \b: JS \b is
// ASCII-only, so \bestá\b (ends in a non-ASCII letter) never matches.
const ES_STOPWORDS =
  /(?<![a-záéíóúñü])(que|los|las|del|una|para|más|pero|muy|también|está|cuando|porque|como|además|según|entre|sobre|ya|ser|sin|sus|este|esta|eso|esa|esos|esas)(?![a-záéíóúñü])/gi;
// Portuguese guard: words and diacritics (ã/õ/ç) that occur in PT but
// not in Spanish. "dos"/"das" are NOT listed — "dos" is a high-frequency
// SPANISH numeral and would break the 3:1 ratio on genuine ES text.
const PT_MARKS =
  /(?<![a-zàáâãçéêíóôõú])(não|ção|ções|uma|então|mesmo|após|[ãõç])(?![a-zàáâãçéêíóôõú])/gi;
const EN_MARKS = /(?<![a-z])(the|and|of|to|in|is|that|it|with|for)(?![a-z])/gi;
// ñ/¿/¡ occur in no other supported language — a modest count is a
// fast ES signal, but dominance is guarded like kana: an EN text
// quoting them (language blog, ¡Hola! headline) must stay its
// dominant language.
const ES_STRONG = /[ñ¿¡]/g;

function spanishMarkers(sample: string): { strong: number; stop: number; pt: number; en: number } {
  const strong = (sample.match(ES_STRONG) ?? []).length;
  const stop = (sample.match(ES_STOPWORDS) ?? []).length;
  const pt = (sample.match(PT_MARKS) ?? []).length;
  const en = (sample.match(EN_MARKS) ?? []).length;
  return { strong, stop, pt, en };
}

export function detectLang(path: string, content: string): Lang {
  const segs = path.toLowerCase().split(/[/\\._-]+/);
  for (const seg of segs) {
    if (seg === "ru" || seg === "russian") return "ru";
    if (seg === "ko" || seg === "kor" || seg === "korean") return "ko";
    if (seg === "vi" || seg === "vie" || seg === "vietnamese") return "vi";
    if (seg === "ja" || seg === "jpn" || seg === "japanese" || seg === "jp") return "ja";
    if (seg === "es" || seg === "spa" || seg === "spanish" || seg === "espanol") return "es";
    if (seg === "en" || seg === "eng") return "en";
  }
  const sample = content.slice(0, 4000);
  const hangul = (sample.match(/[\uac00-\ud7af]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) ?? []).length;
  // Vietnamese Latin Extended Additional (U+1EA0..U+1EF9) is uniquely VI
  // (precomposed tone vowels); base letters alone are shared with ro/pt/tr.
  const viMarks = (sample.match(/[\u1ea0-\u1ef9ăâêôơưđĂÂÊÔƠƯĐ]/g) ?? []).length;
  const latin = (sample.match(/[a-z]/gi) ?? []).length;
  // Kana (hiragana + katakana) occurs in no other supported language, so
  // a modest count is decisive — but dominance is guarded like hangul: a
  // mostly-RU/EN file quoting Japanese (language blog, haiku) must stay
  // its dominant language. Kanji WITHOUT kana is ambiguous (Japanese vs
  // Chinese) — deliberately not JA; falls through to "en" and the report
  // marks the file language_uncertain.
  const kana = (sample.match(/[\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length;
  if (hangul > 10 && hangul * 3 > cyrillic) return "ko";
  if (cyrillic > 10 && cyrillic > hangul * 3) return "ru";
  if (kana > 10 && kana * 3 > cyrillic) return "ja";
  const es = spanishMarkers(sample);
  // Fast path: strong markers dominate the few an EN text could carry
  // (kana*3>cyrillic precedent). Frequency path: ES-exclusive stopwords
  // must outnumber PT marks 3:1 (ã/õ/ç words) and EN function words 2:1.
  if (es.strong > 5 && es.strong * 5 > es.en) return "es";
  if (es.stop > 40 && es.stop > es.pt * 3 && es.stop > es.en * 2) return "es";
  if (viMarks > 8 && viMarks * 5 > latin) return "vi";
  if (viMarks > 20 && latin > viMarks * 3) return "vi"; // vi with much latin/code
  return "en";
}

export function isConfident(path: string, content: string): boolean {
  // Path-based detection is always confident.
  const segs = path.toLowerCase().split(/[/\\._-]+/);
  if (segs.some((s) => ["ru", "ko", "vi", "en", "ja", "es", "spa", "spanish", "espanol", "jpn", "japanese", "jp"].includes(s))) return true;
  const sample = content.slice(0, 4000);
  const hangul = (sample.match(/[\uac00-\ud7af]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) ?? []).length;
  const kana = (sample.match(/[\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length;
  const viMarks = (sample.match(/[ăâêôơưđĂÂÊÔƠƯĐ]/g) ?? []).length;
  // Same counter as detection: strong markers (ñ/¿/¡) are too rare in
  // prose to ever reach 50, but 50 ES-exclusive stopwords are.
  const esStop = (sample.match(ES_STOPWORDS) ?? []).length;
  return hangul > 50 || cyrillic > 50 || kana > 50 || viMarks > 50 || esStop > 50;
}
