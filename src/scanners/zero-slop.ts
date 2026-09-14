import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";

const PINNED = "zero-slop@2.12.1";

/**
 * zero-slop (npx, pinned): 294 weighted English patterns — the
 * cross-detector that catches contrast formulas ("not X. It's Y")
 * which dash-to-period rewrites themselves introduce.
 */
export class ZeroSlopScanner implements Scanner {
  readonly name = "zero-slop";
  readonly langs: Lang[] = ["en"];

  async available(): Promise<boolean> {
    const { code } = await runCmd(["npx", "--yes", PINNED, "--version"], { timeoutMs: 120_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const findings: Finding[] = [];
    for (const file of files) {
      const { code, stdout, stderr } = await runCmd(
        ["npx", "--yes", PINNED, "score", file, "--json"],
        { timeoutMs: 120_000 },
      );
      if (code !== 0) {
        return failedRun(this.name, files.length, stderr || `exit ${code} on ${file}`);
      }
      try {
        const doc = JSON.parse(stdout) as ZeroSlopJson;
        const issues: string[] = [];
        for (const hit of doc.hits ?? []) {
          issues.push(`[${hit.cat}/${hit.name}] ${hit.quote ?? ""}`);
        }
        if ((doc.ai_likelihood ?? 0) >= 25 || issues.length > 0) {
          for (const q of issues) {
            findings.push({
              tool: this.name,
              lang,
              file,
              line: null,
              severity: doc.ai_likelihood >= 25 ? "high-likelihood" : "hit",
              category: "zero-slop-hit",
              quote: q.slice(0, 200),
              priority: null,
              fpSuppressed: false,
              fpReason: null,
            });
          }
          if (issues.length === 0) {
            findings.push({
              tool: this.name,
              lang,
              file,
              line: null,
              severity: "structural",
              category: `ai_likelihood=${doc.ai_likelihood} evidence=${doc.evidence}`,
              quote: `tell_density=${doc.tell_density_per_100w}/100w emdash=${doc.emdash_per_100w}/100w`,
              priority: null,
              fpSuppressed: false,
              fpReason: null,
            });
          }
        }
      } catch (e) {
        return failedRun(this.name, files.length, `parse error on ${file}: ${e}`);
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}

interface ZeroSlopJson {
  ai_likelihood?: number;
  evidence?: number;
  tell_density_per_100w?: number;
  emdash_per_100w?: number;
  hits?: { cat?: string; name?: string; quote?: string }[];
}
