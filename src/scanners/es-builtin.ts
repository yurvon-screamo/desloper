import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { configPath } from "../paths.ts";
import { compilePyRegex } from "./vi-builtin.ts";

/**
 * Built-in Spanish structural scanner: catalog absorbed as data from
 * dorelysm/naturalizacion-texto-es (MIT, SUBSTITUTIONS.md tiers 1/3/4)
 * — config/dictionaries/es-patterns.json — plus hand-coded repetition
 * detectors (trios, -mente chains, poder+infinitivo, spaced em-dash
 * inciso with the dialogue-raya guard). Zero subprocess, zero network.
 * Tier-2 vocabulary lives in the phrases scanner (SERIES_WEAK.es);
 * pomposity-frame overlaps with SERIES_CLICHES.es are excluded there
 * (ja dedup policy).
 */

interface Pattern {
  name: string;
  cat: string;
  rx: string;
  w: number;
  re?: RegExp;
}

let cache: (Pattern & { re: RegExp })[] | null = null;

async function load(): Promise<(Pattern & { re: RegExp })[]> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(configPath("dictionaries/es-patterns.json")).text(),
  ) as { patterns: Pattern[] };
  const compiled = raw.patterns
    .map((p) => {
      const re = compilePyRegex(p.rx);
      return re ? { ...p, re } : null;
    })
    .filter((p): p is Pattern & { re: RegExp } => p !== null);
  cache = compiled;
  return cache;
}

/** The scanner skips hand-coded-detector matches inside code fences:
 * triads/dashes/numbers are legitimate code content. JSON rules follow
 * the per-line behavior of the other catalog scanners (no fence skip). */
function fenceMask(lines: string[]): boolean[] {
  const inside: boolean[] = [];
  let open = false;
  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inside.push(open);
      open = !open;
    } else {
      inside.push(open);
    }
  }
  return inside;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** Regex with ES letter set in both boundary classes (ASCII \b fails on
 * words ending in á/é/í/ó/ú/ñ/ü). */
const ES_TRIAD = /(?<![\wáéíóúñü])[\wáéíóúñü]+,\s+[\wáéíóúñü]+\s+y\s+[\wáéíóúñü]+(?![\wáéíóúñü])/gi;
// Stem >=3 chars excludes the noun "mente" (mind) and "demente" (mad);
// lookarounds keep accented-stem adverbs whole (últimamente, fácilmente).
const ES_MENTE = /(?<![\wáéíóúñü])[\wáéíóúñü]{3,}mente(?![\wáéíóúñü])/gi;
// Enclitic infinitives ("pueden ayudarnos") counted via the optional
// attached-pronoun group; simple forms ("puede ayudar") via the base.
// Future-tense forms (podré/podrás/podréis/podrán) included: slop built
// on future promises ("podrá transformar…") is the same tell.
const ES_PODER =
  /\b(?:puedo|puedes|puede|podemos|podáis|pueden|podría|podrías|podríamos|podrían|podré|podrás|podréis|podremos|podrán)\s+[\wáéíóúñü]+(?:ar|er|ir)(?:lo|la|le|los|las|nos|se)?\b/gi;
// True inciso: the dash pair encloses a clause without sentence enders.
// Two unrelated consequence dashes on one line ("Ganamos — porque X.
// Perdimos — porque Y.") do not form an inciso and stay clean.
const EM_DASH_INCISO = / — [^—\n.!?]+? — /g;

export class EsBuiltinScanner implements Scanner {
  readonly name = "es-lint";
  readonly langs: Lang[] = ["es"];

  async available(): Promise<boolean> {
    try {
      return (await load()).length > 0;
    } catch {
      return false;
    }
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const patterns = await load();
    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      this.scanCatalog(content, file, lang, patterns, findings);
      this.scanStructural(content, file, lang, findings);
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }

  private scanCatalog(
    content: string,
    file: string,
    lang: Lang,
    patterns: (Pattern & { re: RegExp })[],
    findings: Finding[],
  ): void {
    for (const p of patterns) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.re.exec(content))) {
        findings.push({
          tool: this.name,
          lang,
          file,
          line: lineOf(content, m.index),
          severity: p.w >= 4 ? "high" : "medium",
          category: `es:${p.cat}`,
          quote: m[0].trim().slice(0, 200),
          priority: null,
          fpSuppressed: false,
          fpReason: null,
        });
        if (m.index === p.re.lastIndex) p.re.lastIndex++; // zero-width guard
      }
    }
  }

  /** Hand-coded repetition/structure detectors: fire on document-level
   * density (single legitimate uses must stay FP-free). */
  private scanStructural(content: string, file: string, lang: Lang, findings: Finding[]): void {
    const lines = content.split("\n");
    const mask = fenceMask(lines);

    let triads = 0;
    let poderInf = 0;
    for (let i = 0; i < lines.length; i++) {
      if (mask[i]) continue;
      triads += (lines[i].match(ES_TRIAD) ?? []).length;
      poderInf += (lines[i].match(ES_PODER) ?? []).length;
    }
    if (triads >= 3) {
      findings.push(this.aggregate(file, lang, "es:triads", "high", `triads ×${triads}`));
    }
    if (poderInf >= 3) {
      findings.push(this.aggregate(file, lang, "es:poder_infinitivo", "medium", `poder+infinitivo ×${poderInf}`));
    }

    // -mente chains: 2+ adverbs in one sentence; a line yields at most
    // one finding (quote lists the first adverbs seen).
    for (let i = 0; i < lines.length; i++) {
      if (mask[i]) continue;
      for (const sentence of lines[i].split(/[.!?]\s/)) {
        const adverbs = sentence.match(ES_MENTE) ?? [];
        if (adverbs.length >= 2) {
          findings.push({
            tool: this.name,
            lang,
            file,
            line: i + 1,
            severity: "medium",
            category: "es:mente_adverb_chain",
            quote: adverbs.slice(0, 3).join(", ").slice(0, 200),
            priority: null,
            fpSuppressed: false,
            fpReason: null,
          });
          break;
        }
      }
    }

    // Spaced em-dash inciso: BOTH sides spaced AND enclosing a clause
    // without sentence enders (" — así — "). The Spanish dialogue raya
    // attaches to the speech ("—Hola") and never counts; a single
    // spaced dash, or two unrelated consequence dashes on one line,
    // stay clean (they are stylistically legitimate).
    for (let i = 0; i < lines.length; i++) {
      if (mask[i]) continue;
      if (lines[i].match(EM_DASH_INCISO)) {
        findings.push({
          tool: this.name,
          lang,
          file,
          line: i + 1,
          severity: "medium",
          category: "es:em_dash_inciso",
          quote: lines[i].trim().slice(0, 200),
          priority: null,
          fpSuppressed: false,
          fpReason: null,
        });
      }
    }
  }

  private aggregate(
    file: string,
    lang: Lang,
    category: string,
    severity: "high" | "medium",
    quote: string,
  ): Finding {
    return {
      tool: this.name,
      lang,
      file,
      line: null,
      severity,
      category,
      quote,
      priority: null,
      fpSuppressed: false,
      fpReason: null,
    };
  }
}
