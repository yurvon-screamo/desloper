import type { AawDocument } from "avoid-ai-writing-detector/detector/patterns.js";
import type { Finding, Lang } from "./types.ts";
import { failedRun, type Scanner, type ScannerResult } from "./base.ts";

/**
 * avoid-ai-writing-detector (npm, deterministic, MIT). English only.
 * Runs IN-PROCESS via the package's analyzeText() API: the previous
 * node_modules/.bin subprocess kept EN scanning hostage to a Node
 * install, which compiled binaries cannot assume. The CLI wrapper
 * semantics are reproduced exactly (options, empty-stats patch, JSON
 * document shape); tests/en-golden-diff.test.ts guards equivalence
 * against the pinned bin output.
 *
 * The analyzer loads lazily so a dev checkout without node_modules
 * degrades through the Scanner availability contract (tool_run
 * ok:false, audit incomplete) instead of crashing the CLI. In
 * compiled builds the package is bundled and always present.
 *
 * Gate convention from the production series: threshold 6 findings
 * per file (corpus-calibrated by the upstream project).
 */

// The exact flags the scanner always passed to the bin CLI
// (`--context technical --source-mode rendered-markdown`).
const ANALYZE_OPTIONS = { contextMode: "technical", sourceMode: "rendered-markdown" };

type Analyzer = { analyzeText: (text: string, options?: typeof ANALYZE_OPTIONS) => AawDocument };

let analyzerCache: Analyzer | null | undefined;
async function loadAnalyzer(): Promise<Analyzer | null> {
  if (analyzerCache !== undefined) return analyzerCache;
  try {
    const mod = await import("avoid-ai-writing-detector/detector/patterns.js");
    const candidate: unknown = (mod as { default?: unknown }).default ?? mod;
    const analyzer = candidate as Analyzer | null;
    analyzerCache =
      analyzer && typeof analyzer.analyzeText === "function" ? analyzer : null;
  } catch {
    analyzerCache = null;
  }
  return analyzerCache;
}

/** Mirror of bin/avoid-ai-writing.js main(): analyzeText() returns an
 *  empty stats object for empty input, and the bin patches the selected
 *  modes in so its option contract holds in every case. Exported for
 *  the golden-diff test. */
export async function analyzeDocument(text: string): Promise<AawDocument> {
  const analyzer = await loadAnalyzer();
  if (!analyzer) throw new Error("analyzer not installed");
  const doc = analyzer.analyzeText(text, ANALYZE_OPTIONS);
  if (doc.stats && Object.keys(doc.stats).length === 0) {
    doc.stats.contextMode = ANALYZE_OPTIONS.contextMode;
    doc.stats.sourceMode = ANALYZE_OPTIONS.sourceMode;
  }
  return doc;
}

export class AvoidAiWritingScanner implements Scanner {
  readonly name = "avoid-ai-writing";
  readonly langs: Lang[] = ["en"];

  async available(): Promise<boolean> {
    return (await loadAnalyzer()) !== null;
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const analyzer = await loadAnalyzer();
    if (!analyzer) {
      return failedRun(
        this.name,
        files.length,
        "avoid-ai-writing-detector not available (bun install in dev checkouts; bundled in compiled binaries)",
      );
    }
    const findings: Finding[] = [];
    for (const file of files) {
      const text = contents?.get(file) ?? (await Bun.file(file).text());
      let doc: AawDocument;
      try {
        doc = await analyzeDocument(text);
      } catch (e) {
        return failedRun(this.name, files.length, `analysis error on ${file}: ${e}`);
      }
      for (const issue of doc.issues ?? []) {
        findings.push({
          tool: this.name,
          lang,
          file,
          line: null,
          severity: issue.severity ?? null,
          category: issue.type ?? null,
          quote: issue.text?.slice(0, 200) ?? null,
          priority: null,
          fpSuppressed: false,
          fpReason: null,
        });
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}
