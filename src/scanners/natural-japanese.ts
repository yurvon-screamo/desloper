import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";
import { vendorsDir } from "../paths.ts";

/**
 * natural-japanese (coji, MIT): corpus-calibrated JA detectors — 137
 * human / 406 AI texts across 7 models. Rhythm burstiness (mora-based
 * sentence length), uniform paragraph structure, translationese, stock
 * phrases. DETERMINISTIC lint.py ONLY: the vendor's LLM rewrite skill
 * (SKILL.md) is deliberately never invoked from desloper.
 * The lint exits 0 regardless of finding count (1 = input error), so
 * a failed run is a nonzero exit OR stdout that does not parse as the
 * documented JSON schema — never trusted as "clean".
 */
export class NaturalJapaneseScanner implements Scanner {
  readonly name = "natural-japanese";
  readonly langs: Lang[] = ["ja"];

  private py(): string {
    return join(vendorsDir(), ".venv/bin/python");
  }

  private lintScript(): string {
    return join(vendorsDir(), "natural-japanese/skills/natural-japanese/scripts/lint.py");
  }

  async available(): Promise<boolean> {
    const { code } = await runCmd([this.py(), this.lintScript(), "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const findings: Finding[] = [];
    for (const file of files) {
      // The file path (never content) crosses the process boundary.
      // sudachi dictionary load is heavy: generous per-file timeout.
      const { code, stdout, stderr } = await runCmd(
        [this.py(), this.lintScript(), file, "--genre", "essay", "--json"],
        { timeoutMs: 180_000 },
      );
      if (code !== 0) {
        return failedRun(this.name, files.length, stderr || `exit ${code} on ${file}`);
      }
      let parsed: { findings?: VendorFinding[] };
      try {
        parsed = JSON.parse(stdout) as { findings?: VendorFinding[] };
      } catch {
        return failedRun(this.name, files.length, `unparseable lint.py JSON on ${file}`);
      }
      if (!Array.isArray(parsed.findings)) {
        return failedRun(this.name, files.length, `missing findings[] on ${file}`);
      }
      for (const vf of parsed.findings) {
        if (typeof vf.category !== "string" || typeof vf.excerpt !== "string") {
          process.stderr.write(`warn: natural-japanese: malformed finding skipped on ${file}\n`);
          continue;
        }
        findings.push({
          tool: this.name,
          lang,
          file,
          line: typeof vf.line === "number" ? vf.line : null,
          severity: vf.severity ?? null,
          category: `ja:${vf.category}`,
          quote: vf.excerpt,
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

interface VendorFinding {
  line?: number;
  category?: string;
  excerpt?: string;
  severity?: string;
}
