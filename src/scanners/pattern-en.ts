import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";

/**
 * Built-in EN structural-pattern scanner (replaces zero-slop npx dep):
 * 139 regex patterns + 95-word lexicon extracted from ZeroSlop@2.12.1
 * (MIT, manavmishra) — filtered to the categories that fired in the
 * production series: contrast formulas (not-X-It's-Y — the patterns
 * dash-to-period rewrites themselves create), scaffolding, hedging,
 * marketing register, puffery, drama closers, linkedin openers, filler.
 * Zero subprocess, zero network.
 */

interface Pattern {
  name: string;
  cat: string;
  rx: string;
  w: number;
  re?: RegExp;
}

const ROOT = join(import.meta.dir, "../..");
let cache: { patterns: Pattern[]; lexicon: Record<string, number> } | null = null;

async function load(): Promise<{ patterns: Pattern[]; lexicon: Record<string, number> }> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(join(ROOT, "config/dictionaries/zero-slop-patterns.json")).text(),
  ) as { patterns: Pattern[]; lexicon: Record<string, number> };
  // Compile with Python→JS flag conversion (same approach as vi-builtin)
  const compiled = raw.patterns
    .map((p) => {
      try {
        // Python (?i) inline → JS "i" flag; strip from body
        const body = p.rx.replace(/\(\?[a-z]+\)/g, "");
        return { ...p, re: new RegExp(body, "gi") };
      } catch {
        return null;
      }
    })
    .filter((p): p is Pattern & { re: RegExp } => p !== null);
  cache = { patterns: compiled, lexicon: raw.lexicon };
  return cache;
}

export class PatternScanner implements Scanner {
  readonly name = "patterns-en";
  readonly langs: Lang[] = ["en"];

  async available(): Promise<boolean> {
    try {
      return (await load()).patterns.length > 0;
    } catch {
      return false;
    }
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const { patterns, lexicon } = await load();
    const lexWords = Object.keys(lexicon);
    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      const lines = content.split("\n");
      for (const p of patterns) {
        if (!p.re) continue;
        for (let i = 0; i < lines.length; i++) {
          p.re.lastIndex = 0;
          const m = p.re.exec(lines[i]);
          if (m && m[0]) {
            findings.push({
              tool: this.name,
              lang,
              file,
              line: i + 1,
              severity: p.w >= 4 ? "high" : "medium",
              category: `zs:${p.cat}/${p.name}`,
              quote: m[0].slice(0, 200),
              priority: null,
              fpSuppressed: false,
              fpReason: null,
            });
          }
        }
      }
      // Lexicon words (delve, tapestry, leverage, seamless...)
      const lower = content.toLowerCase();
      for (const word of lexWords) {
        const wLower = word.toLowerCase();
        let count = 0;
        let idx = lower.indexOf(wLower);
        while (idx !== -1) {
          count++;
          idx = lower.indexOf(wLower, idx + wLower.length);
        }
        if (count > 0) {
          findings.push({
            tool: this.name,
            lang,
            file,
            line: null,
            severity: lexicon[word] >= 5 ? "high" : "medium",
            category: "zs:lexicon",
            quote: `${word}${count > 1 ? ` ×${count}` : ""}`,
            priority: null,
            fpSuppressed: false,
            fpReason: null,
          });
        }
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}
