import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { parseConcatenatedJson } from "../normalize.ts";

/**
 * avoid-ai-writing-detector (npm, deterministic). English only.
 * Gate convention from the production series: threshold 6 findings
 * per file (corpus-calibrated by the upstream project).
 */
export class AvoidAiWritingScanner implements Scanner {
  readonly name = "avoid-ai-writing";
  readonly langs: Lang[] = ["en"];
  private bin: string;

  constructor() {
    // npm-installed via bun; bin lives in node_modules/.bin
    this.bin = `${import.meta.dir}/../../node_modules/.bin/avoid-ai-writing`;
  }

  async available(): Promise<boolean> {
    const { code } = await runCmd([this.bin, "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const findings: Finding[] = [];
    for (const file of files) {
      const { code, stdout, stderr } = await runCmd(
        [this.bin, "--source-mode", "rendered-markdown", "--context", "technical", file],
        { timeoutMs: 30_000 },
      );
      if (code === 2) {
        return failedRun(this.name, files.length, stderr || `usage/IO error on ${file}`);
      }
      try {
        const doc = (parseConcatenatedJson(stdout)[0]) as AawJson | undefined;
        if (!doc) continue;
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

interface AawJson {
  score?: number;
  label?: string;
  document_classification?: string;
  issues?: { type?: string; text?: string; severity?: string }[];
}
