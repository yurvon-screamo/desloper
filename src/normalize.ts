/**
 * Normalize concatenated JSON documents (a known batch pitfall:
 * `for f in ...; do tool --json $f; done > out` produces several
 * JSON values in a row that json parsing treats as one broken doc).
 * Also tolerates a top-level array (directory batch mode of some tools).
 */
export function parseConcatenatedJson(raw: string): unknown[] {
  const out: unknown[] = [];
  let idx = 0;
  const s = raw.trim();
  while (idx < s.length) {
    // skip whitespace between documents
    while (idx < s.length && /\s/.test(s[idx])) idx++;
    if (idx >= s.length) break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    const start = idx;
    for (; idx < s.length; idx++) {
      const ch = s[idx];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") {
        depth--;
        if (depth === 0) {
          idx++;
          break;
        }
      }
    }
    if (depth !== 0) throw new Error(`unbalanced JSON at offset ${start}`);
    const doc = JSON.parse(s.slice(start, idx));
    if (Array.isArray(doc)) out.push(...doc);
    else out.push(doc);
  }
  return out;
}
