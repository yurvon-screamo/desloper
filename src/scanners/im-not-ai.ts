import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "../..");

/**
 * im-not-ai (epoko77-ai, MIT): Korean KatFish/post-editese metrics.
 * DETERMINISTIC SHIM ONLY — the deterministic pre-scoring script;
 * LLM routes (light/standard/heavy) are never invoked from desloper.
 * The shim writes a _workspace into cwd, so it runs in a temp dir.
 */
export class ImNotAiScanner implements Scanner {
  readonly name = "im-not-ai";
  readonly langs: Lang[] = ["ko"];

  async available(): Promise<boolean> {
    const py = join(ROOT, "vendors/.venv/bin/python");
    const shim = join(ROOT, "vendors/im-not-ai/scripts/prepare_monolith_input.py");
    const { code } = await runCmd([py, shim, "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const py = join(ROOT, "vendors/.venv/bin/python");
    const shim = join(ROOT, "vendors/im-not-ai/scripts/prepare_monolith_input.py");
    const findings: Finding[] = [];
    for (const file of files) {
      // Content goes through a run-dir file, never through argv:
      // large files hit E2BIG and argv leaks content via `ps`.
      const work = mkdtempSync(join(tmpdir(), "desloper-ko-"));
      try {
        await Bun.write(join(work, "01_input.txt"), await Bun.file(file).text());
        const { code, stdout, stderr } = await runCmd(
          [py, shim, "--run-dir", work, "--genre", "essay"],
          { cwd: work, timeoutMs: 60_000 },
        );
        if (code !== 0) {
          return failedRun(this.name, files.length, stderr || `exit ${code} on ${file}`);
        }
        const band = stdout.match(/risk_band=(\S+)/)?.[1] ?? "?";
        const score = stdout.match(/risk_score=(\d+)/)?.[1] ?? "?";
        const route = stdout.match(/route_hint=(\S+)/)?.[1] ?? "?";
        if (band !== "low") {
          findings.push({
            tool: this.name,
            lang,
            file,
            line: null,
            severity: band,
            category: "ko:risk_band",
            quote: `risk_band=${band} risk_score=${score} route_hint=${route}`,
            priority: null,
            fpSuppressed: false,
            fpReason: null,
          });
        }
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}
