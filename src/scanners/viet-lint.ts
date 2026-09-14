import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";
import { parseConcatenatedJson } from "../normalize.ts";

const ROOT = join(import.meta.dir, "../..");

/**
 * viet-writing-lint (longhang2004/vietnamese-humanizer, MIT):
 * heuristic surface linter with its own ERROR/WARNING/PREFERENCE/
 * HEURISTIC taxonomy (vendor calibration stays inside the wrapper).
 * Grammar token rules (GRA-P01/P02: spacing) are markdown-noisy on
 * URLs/tables — they are kept but downgraded to P2 by triage config.
 */
export class VietLintScanner implements Scanner {
  readonly name = "viet-lint";
  readonly langs: Lang[] = ["vi"];

  async available(): Promise<boolean> {
    const bin = join(ROOT, "vendors/.venv/bin/viet-writing-lint");
    const { code } = await runCmd([bin, "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const bin = join(ROOT, "vendors/.venv/bin/viet-writing-lint");
    const vendorRoot = join(ROOT, "vendors/vietnamese-humanizer");
    const findings: Finding[] = [];
    for (const file of files) {
      const { code, stdout, stderr } = await runCmd(
        [bin, file, "--root", vendorRoot, "--format", "json"],
        { timeoutMs: 60_000 },
      );
      if (code === 2) {
        return failedRun(this.name, files.length, stderr || `cannot run on ${file}`);
      }
      try {
        const doc = parseConcatenatedJson(stdout)[0] as VietLintJson | undefined;
        if (!doc) continue;
        for (const issue of doc.issues ?? []) {
          if ((issue.pattern_id ?? "").startsWith("VI-HUM")) {
            for (const occ of issue.occurrences ?? []) {
              findings.push({
                tool: this.name,
                lang,
                file,
                line: occ.line ?? null,
                severity: issue.severity ?? null,
                category: issue.pattern_id ?? "VI-HUM",
                quote: (occ.excerpt ?? "").slice(0, 200),
                priority: null,
                fpSuppressed: false,
                fpReason: null,
              });
            }
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

interface VietLintJson {
  issues?: {
    pattern_id?: string;
    severity?: string;
    finding_type?: string;
    occurrences?: { line?: number; excerpt?: string }[];
  }[];
}
