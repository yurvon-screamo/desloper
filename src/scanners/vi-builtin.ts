import type { Finding, Lang } from "./types.ts";
import { failedRun, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";

/**
 * Built-in Vietnamese scanner: matches the pattern catalog of
 * vietnamese-humanizer (MIT, longhang2004) converted to JSON —
 * config/dictionaries/vi-patterns.json. Reports VI-HUM-* pattern ids
 * with line numbers; the vendor's taxonomy (finding_type/severity)
 * is preserved.
 */

interface ViPattern {
  id: string;
  category?: string;
  finding_type?: string;
  severity?: string;
  signals?: { regex?: string[]; phrases?: string[] };
  false_positive_risk?: Record<string, unknown>;
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

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const patterns = (await loadPatterns()).filter((p) => (p.id ?? "").startsWith("VI-HUM"));
    const compiled = patterns
      .map((p) => {
        const regexes = (p.signals?.regex ?? []).map((r) => {
          try {
            return new RegExp(r, "gi");
          } catch {
            return null;
          }
        });
        return { p, regexes: regexes.filter((r): r is RegExp => r !== null) };
      })
      .filter(({ regexes }) => regexes.length > 0);
    const findings: Finding[] = [];
    for (const file of files) {
      const content = await Bun.file(file).text();
      const lines = content.split("\n");
      for (const { p, regexes } of compiled) {
        for (const re of regexes) {
          for (let i = 0; i < lines.length; i++) {
            re.lastIndex = 0;
            const m = re.exec(lines[i]);
            if (m) {
              findings.push({
                tool: this.name,
                lang,
                file,
                line: i + 1,
                severity: p.severity ?? null,
                category: p.id,
                quote: m[0].slice(0, 200),
                priority: null,
                fpSuppressed: false,
                fpReason: null,
              });
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
