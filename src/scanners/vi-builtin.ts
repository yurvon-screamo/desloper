import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";

/**
 * Built-in Vietnamese scanner: matches the pattern catalog of
 * vietnamese-humanizer (MIT, longhang2004) converted to JSON —
 * config/dictionaries/vi-patterns.json. Reports VI-HUM-* pattern ids
 * with line numbers; the vendor's taxonomy (finding_type/severity)
 * is preserved. Python inline regex flags ((?m), (?s), (?i)) are
 * converted to JS constructor flags; signals.phrases entries are
 * matched as substrings (case-insensitive), same as the vendor CLI.
 */

interface ViPattern {
  id: string;
  category?: string;
  finding_type?: string;
  severity?: string;
  signals?: { regex?: string[]; phrases?: string[] };
}

const ROOT = join(import.meta.dir, "../..");
let cache: ViPattern[] | null = null;

async function loadPatterns(): Promise<ViPattern[]> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(join(ROOT, "config/dictionaries/vi-patterns.json")).text(),
  ) as Record<string, ViPattern[]>;
  cache = Object.values(raw).flat();
  return cache;
}

/** Convert Python inline flags to JS RegExp flags; strip them from body. */
function compilePyRegex(src: string): RegExp | null {
  let flags = "g";
  let body = src;
  const inline = body.matchAll(/\(\?([msaix]+)\)/g);
  for (const m of inline) {
    for (const ch of m[1]) {
      if (ch === "m" || ch === "i") flags += ch === "m" ? "m" : "i";
      else if (ch === "s") flags += "s"; // dotAll
      // x/a have no JS equivalent; drop silently (unused in catalog)
    }
  }
  body = body.replace(/\(\?[msaix]+\)/g, "");
  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
}

export class ViBuiltinScanner implements Scanner {
  readonly name = "viet-lint";
  readonly langs: Lang[] = ["vi"];

  async available(): Promise<boolean> {
    try {
      return (await loadPatterns()).length > 0;
    } catch {
      return false;
    }
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const patterns = (await loadPatterns()).filter((p) => (p.id ?? "").startsWith("VI-HUM"));
    const compiled = patterns
      .map((p) => {
        const regexes = (p.signals?.regex ?? [])
          .map(compilePyRegex)
          .filter((r): r is RegExp => r !== null);
        const phrases = (p.signals?.phrases ?? []).map((s) => s.toLowerCase());
        return { p, regexes, phrases };
      })
      .filter(({ regexes, phrases }) => regexes.length + phrases.length > 0);
    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      const lines = content.split("\n");
      for (const { p, regexes, phrases } of compiled) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let matched = false;
          for (const re of regexes) {
            re.lastIndex = 0;
            let m = re.exec(line);
            while (m && !matched) {
              findings.push(mk(this.name, lang, file, i + 1, p, m[0]));
              matched = true;
              re.lastIndex = 0;
              m = re.exec(line.slice(re.lastIndex + m.index + m[0].length) ? line : "");
              break;
            }
          }
          if (!matched && phrases.length) {
            const lower = line.toLowerCase();
            for (const ph of phrases) {
              if (lower.includes(ph)) {
                findings.push(mk(this.name, lang, file, i + 1, p, ph));
                break;
              }
            }
          }
        }
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}

function mk(tool: string, lang: Lang, file: string, line: number, p: ViPattern, quote: string): Finding {
  return {
    tool,
    lang,
    file,
    line,
    severity: p.severity ?? null,
    category: p.id,
    quote: quote.slice(0, 200),
    priority: null,
    fpSuppressed: false,
    fpReason: null,
  };
}
