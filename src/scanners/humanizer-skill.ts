import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";

const VENDOR_DIR = "vendors/humanizer-skill";
const CLI = "cli/index.js";

/**
 * humanizer-skill (Aboudjem, MIT): local Node metrics CLI. Used in
 * the production series for `score` (4-signal breakdown) — compare
 * mode stays a documented recipe in docs/workflow.md, not part of
 * the audit surface.
 */
export class HumanizerSkillScanner implements Scanner {
  readonly name = "humanizer-skill";
  readonly langs: Lang[] = ["en"];

  async available(): Promise<boolean> {
    const root = join(import.meta.dir, "../..");
    const cli = join(root, VENDOR_DIR, CLI);
    const { code } = await runCmd(["node", cli, "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const root = join(import.meta.dir, "../..");
    const cli = join(root, VENDOR_DIR, CLI);
    const findings: Finding[] = [];
    for (const file of files) {
      const { code, stdout, stderr } = await runCmd(["node", cli, "score", file], {
        timeoutMs: 30_000,
      });
      if (code !== 0 && !stdout.includes("Score:")) {
        return failedRun(this.name, files.length, stderr || `exit ${code} on ${file}`);
      }
      const scoreMatch = stdout.match(/Score:\s*([\d.]+)\/100/);
      if (!scoreMatch) continue;
      const score = Number(scoreMatch[1]);
      if (score >= 30) {
        const signals = [...stdout.matchAll(/^\s+(\w+)\s+([\d.]+).*$/gm)]
          .map((m) => `${m[1]}=${m[2]}`)
          .join(" ");
        findings.push({
          tool: this.name,
          lang,
          file,
          line: null,
          severity: score >= 50 ? "high" : "medium",
          category: "humanizer-score",
          quote: `score=${score}/100 ${signals}`.slice(0, 200),
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
