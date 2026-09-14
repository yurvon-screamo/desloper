import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";
import { parseConcatenatedJson } from "../normalize.ts";

const ROOT = join(import.meta.dir, "../..");

/**
 * humanizer-ru (ilyautov, MIT): 64-marker Russian scanner with genre
 * calibration. Genre is vendor-side calibration and stays INSIDE the
 * wrapper: docs-like paths -> academic, everything else -> marketing
 * (the scanner's own strict default).
 */
export class HumanizerRuScanner implements Scanner {
  readonly name = "humanizer-ru";
  readonly langs: Lang[] = ["ru"];

  async available(): Promise<boolean> {
    const py = join(ROOT, "vendors/.venv/bin/python");
    const scan = join(ROOT, "vendors/humanizer-ru/skills/humanizer-ru/scripts/scan.py");
    const { code } = await runCmd([py, scan, "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const py = join(ROOT, "vendors/.venv/bin/python");
    const scan = join(ROOT, "vendors/humanizer-ru/skills/humanizer-ru/scripts/scan.py");
    const findings: Finding[] = [];
    for (const file of files) {
      const genre = /\/(docs?|documentation|guides)\//i.test(file) ? "academic" : "marketing";
      const { code, stdout, stderr } = await runCmd(
        [py, scan, file, "--genre", genre, "--json"],
        { timeoutMs: 60_000 },
      );
      // Vendor exit semantics: 0 = clean, 1 = findings (CI convention),
      // anything else = cannot run.
      if (code !== 0 && code !== 1) {
        return failedRun(this.name, files.length, stderr || `exit ${code} on ${file}`);
      }
      try {
        const doc = parseConcatenatedJson(stdout)[0] as HumanizerRuJson | undefined;
        if (!doc) continue;
        for (const m of doc.markers ?? []) {
          const [category, quote, count] = m;
          findings.push({
            tool: this.name,
            lang,
            file,
            line: null,
            severity: doc.hard_bans?.some((b) => b[0] === category) ? "hard-ban" : "marker",
            category: `ru:${category}`,
            quote: `${quote ?? ""}${count ? ` ×${count}` : ""}`.slice(0, 200),
            priority: null,
            fpSuppressed: false,
            fpReason: null,
          });
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

interface HumanizerRuJson {
  score?: { score?: number; band?: string };
  markers?: [string, string | null, number | null][];
  hard_bans?: [string, number][];
}
