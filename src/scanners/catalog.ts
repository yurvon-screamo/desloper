import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { type ConfigAsset, configPath } from "../paths.ts";
import { compilePyRegex } from "./vi-builtin.ts";

/**
 * Generic zero-slop-format catalog scanner for languages whose entire
 * detector surface is regex rules (no hand-coded density detectors —
 * those exist only where corpus data justifies them, e.g. es-builtin).
 * Catalog contract (mirrors es-builtin scanCatalog; pinned in
 * config/dictionaries/README.md):
 *   - severity: w >= 4 -> "high", else "medium"
 *   - category: the rule's `cat` verbatim (full, language-prefixed)
 *   - quote: m[0].trim().slice(0, 200); line: computed from m.index
 *   - zero-width guard on the exec loop
 * Unspaced-orthography catalogs (th/my) must not use \b — ASCII \b
 * never matches Thai/Myanmar letters (they are non-word chars in JS),
 * which would silently kill a rule.
 */

interface CatalogPattern {
  name: string;
  cat: string;
  rx: string;
  w: number;
}

export interface CatalogScannerConfig {
  name: string;
  langs: Lang[];
  asset: ConfigAsset;
}

export class CatalogScanner implements Scanner {
  readonly name: string;
  readonly langs: Lang[];
  private readonly asset: ConfigAsset;
  private cache: (CatalogPattern & { re: RegExp })[] | null = null;

  constructor(cfg: CatalogScannerConfig) {
    this.name = cfg.name;
    this.langs = cfg.langs;
    this.asset = cfg.asset;
  }

  async available(): Promise<boolean> {
    try {
      return (await this.load()).length > 0;
    } catch {
      return false;
    }
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const patterns = await this.load();
    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      for (const p of patterns) {
        p.re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = p.re.exec(content))) {
          findings.push({
            tool: this.name,
            lang,
            file,
            line: content.slice(0, m.index).split("\n").length,
            severity: p.w >= 4 ? "high" : "medium",
            category: p.cat,
            quote: m[0].trim().slice(0, 200),
            priority: null,
            fpSuppressed: false,
            fpReason: null,
          });
          if (m.index === p.re.lastIndex) p.re.lastIndex++; // zero-width guard
        }
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }

  private async load(): Promise<(CatalogPattern & { re: RegExp })[]> {
    if (this.cache) return this.cache;
    const raw = JSON.parse(await Bun.file(configPath(this.asset)).text()) as {
      patterns: CatalogPattern[];
    };
    this.cache = raw.patterns
      .map((p) => {
        const re = compilePyRegex(p.rx);
        return re ? { ...p, re } : null;
      })
      .filter((p): p is CatalogPattern & { re: RegExp } => p !== null);
    return this.cache;
  }
}
