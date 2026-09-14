import type { Lang } from "./scanners/types.ts";

/**
 * Detect the dominant language of a file: by path segment first
 * (locale directories like content/ru/, blog/en/), then by script.
 * Known trap covered upstream: texthumanize misdetects vi as fr on
 * auto, so desloper always passes an explicit --lang; when script
 * detection is inconclusive we default to "en" and let the report
 * note the uncertainty (mixed-language files keep EN tools + note).
 */
export function detectLang(path: string, content: string): Lang {
  const segs = path.toLowerCase().split(/[/\\._-]+/);
  for (const seg of segs) {
    if (seg === "ru" || seg === "russian") return "ru";
    if (seg === "ko" || seg === "kor" || seg === "korean") return "ko";
    if (seg === "vi" || seg === "vie" || seg === "vietnamese") return "vi";
    if (seg === "en" || seg === "eng") return "en";
  }
  const sample = content.slice(0, 4000);
  const hangul = (sample.match(/[\uac00-\ud7af]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) ?? []).length;
  // Vietnamese Latin Extended Additional (U+1EA0..U+1EF9) is uniquely VI
  // (precomposed tone vowels); base letters alone are shared with ro/pt/tr.
  const viMarks = (sample.match(/[\u1ea0-\u1ef9ăâêôơưđĂÂÊÔƠƯĐ]/g) ?? []).length;
  const latin = (sample.match(/[a-z]/gi) ?? []).length;
  if (hangul > 10 && hangul * 3 > cyrillic) return "ko";
  if (cyrillic > 10 && cyrillic > hangul * 3) return "ru";
  if (viMarks > 8 && viMarks * 5 > latin) return "vi";
  if (viMarks > 20 && latin > viMarks * 3) return "vi"; // vi with much latin/code
  return "en";
}

export function isConfident(path: string, content: string): boolean {
  // Path-based detection is always confident.
  const segs = path.toLowerCase().split(/[/\\._-]+/);
  if (segs.some((s) => s === "ru" || s === "ko" || s === "vi" || s === "en")) return true;
  const sample = content.slice(0, 4000);
  const hangul = (sample.match(/[\uac00-\ud7af]/g) ?? []).length;
  const cyrillic = (sample.match(/[\u0400-\u04ff]/g) ?? []).length;
  const viMarks = (sample.match(/[ăâêôơưđĂÂÊÔƠƯĐ]/g) ?? []).length;
  return hangul > 50 || cyrillic > 50 || viMarks > 50;
}
