import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { configPath } from "../paths.ts";

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

let cache: ViPattern[] | null = null;

async function loadPatterns(): Promise<ViPattern[]> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(configPath("dictionaries/vi-patterns.json")).text(),
  ) as Record<string, ViPattern[]>;
  cache = Object.values(raw).flat();
  return cache;
}

/** Convert Python inline flags to JS RegExp flags; strip them from body.
 *  Exported for the catalog compile-guard test. */
export function compilePyRegex(src: string): RegExp | null {
  const flagSet = new Set<string>(["g"]);
  const body = src.replace(/\(\?([msaix]+)\)/g, (_all, chars: string) => {
    for (const ch of chars) {
      if (ch === "m" || ch === "i" || ch === "s") flagSet.add(ch);
      // x/a have no JS equivalent; drop (unused in catalog)
    }
    return "";
  });
  try {
    return new RegExp(body, [...flagSet].join(""));
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
            while (m) {
              findings.push(mk(this.name, lang, file, i + 1, p, m[0]));
              matched = true;
              if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
              m = re.exec(line);
              if (m && m.index === re.lastIndex - 1 && m[0] === "") break;
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
