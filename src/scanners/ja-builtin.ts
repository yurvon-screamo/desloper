import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { configPath } from "../paths.ts";

/**
 * Built-in Japanese scanner: matches the pattern catalog of
 * textlint-ja/textlint-rule-preset-ai-writing (MIT, azu) converted to
 * JSON — config/dictionaries/ja-patterns.json. The kuromojin-dependent
 * rule (no-ai-colon-continuation) and the subjective
 * ai-tech-writing-guideline are deliberately NOT absorbed (parser
 * dependency / false-positive-prone advice); hype entries already
 * covered by the phrases scanner are not duplicated here.
 * Regexes are converted to JS-compatible source; signals.phrases
 * entries are matched as plain substrings. Reports JA-AI-* ids with
 * line numbers, one finding per occurrence.
 */

interface JaPattern {
  id: string;
  severity?: string;
  signals?: { regex?: string[]; phrases?: string[] };
}

let cache: JaPattern[] | null = null;

async function loadPatterns(): Promise<JaPattern[]> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(configPath("dictionaries/ja-patterns.json")).text(),
  ) as Record<string, JaPattern[]>;
  cache = Object.values(raw).flat();
  return cache;
}

/** Compile a catalog regex source; null on invalid pattern.
 *  Exported for the catalog compile-guard test. */
export function compileRuleRegex(src: string): RegExp | null {
  try {
    return new RegExp(src, "gm");
  } catch {
    return null;
  }
}

interface CompiledRule {
  id: string;
  severity: string | null;
  regexes: RegExp[];
  phrases: string[];
}

async function loadRules(): Promise<CompiledRule[]> {
  const patterns = await loadPatterns();
  return patterns.map((p) => ({
    id: p.id,
    severity: p.severity ?? null,
    regexes: (p.signals?.regex ?? [])
      .map(compileRuleRegex)
      .filter((re): re is RegExp => re !== null),
    phrases: p.signals?.phrases ?? [],
  }));
}

export class JaBuiltinScanner implements Scanner {
  readonly name = "ja-lint";
  readonly langs: Lang[] = ["ja"];

  async available(): Promise<boolean> {
    try {
      return (await loadPatterns()).length > 0;
    } catch {
      return false;
    }
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const rules = await loadRules();
    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const rule of rules) {
          for (const re of rule.regexes) {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(line)) !== null) {
              findings.push({
                tool: this.name,
                lang,
                file,
                line: i + 1,
                severity: rule.severity,
                category: rule.id,
                quote: m[0].trim(),
                priority: null,
                fpSuppressed: false,
                fpReason: null,
              });
              if (m[0].length === 0) re.lastIndex++; // zero-width guard
            }
          }
          for (const phrase of rule.phrases) {
            let idx = line.indexOf(phrase);
            while (idx !== -1) {
              findings.push({
                tool: this.name,
                lang,
                file,
                line: i + 1,
                severity: rule.severity,
                category: rule.id,
                quote: phrase,
                priority: null,
                fpSuppressed: false,
                fpReason: null,
              });
              idx = line.indexOf(phrase, idx + phrase.length);
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
