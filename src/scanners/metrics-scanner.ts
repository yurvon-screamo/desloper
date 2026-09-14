import type { Finding, Lang } from "./types.ts";
import { failedRun, type Scanner, type ScannerResult } from "./base.ts";

/**
 * Built-in metrics scanner: a vendored copy of humanizer-skill's
 * deterministic lib (MIT, Aboudjem) — tokenize/vocabulary/metrics are
 * copied as-is, dependency-free CommonJS. Four signals: lexical tells
 * density, burstiness, trigram repetition, MATTR diversity; composite
 * score 0-100 with the upstream anchors and weights.
 */
const metrics = require("./metrics.js") as {
  scoreText: (t: string) => { score?: number; signals?: Record<string, unknown> };
};

export class MetricsScanner implements Scanner {
  readonly name = "metrics";
  readonly langs: Lang[] = ["en"];

  async available(): Promise<boolean> {
    return typeof metrics.scoreText === "function";
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const findings: Finding[] = [];
    for (const file of files) {
      const content = await Bun.file(file).text();
      try {
        const res = metrics.scoreText(content);
        const score = res.score ?? 0;
        // 30 = humanizer's "Mixed" band floor; 50+ = "Pure AI smell".
        if (score >= 30) {
          const breakdown = Object.entries(res.signals ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join(" ");
          findings.push({
            tool: this.name,
            lang,
            file,
            line: null,
            severity: score >= 50 ? "high" : "medium",
            category: "humanizer-score",
            quote: `score=${score}/100 ${breakdown}`.slice(0, 200),
            priority: null,
            fpSuppressed: false,
            fpReason: null,
          });
        }
      } catch (e) {
        return failedRun(this.name, files.length, `analyze error on ${file}: ${e}`);
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}
