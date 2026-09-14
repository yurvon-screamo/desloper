import type { Finding, Lang } from "./types.ts";
import { failedRun, runCmd, type Scanner, type ScannerResult } from "./base.ts";
import { parseConcatenatedJson } from "../normalize.ts";

/**
 * texthumanize: multilingual detector (--detect-ai ONLY — rewriting
 * modes are deliberately inaccessible from desloper). Language is
 * always forced with -l because the tool's auto-detect confuses
 * Vietnamese with French (known production trap).
 */
export class TextHumanizeScanner implements Scanner {
  readonly name = "texthumanize";
  readonly langs: Lang[] = ["en", "ru", "ko", "vi"];

  async available(): Promise<boolean> {
    const { code } = await runCmd(["texthumanize", "--help"], { timeoutMs: 15_000 });
    return code === 0;
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const findings: Finding[] = [];
    for (const file of files) {
      const { code, stdout, stderr } = await runCmd(
        ["texthumanize", "--detect-ai", "--json", "-l", lang, file],
        { timeoutMs: 60_000 },
      );
      if (code !== 0 && !stdout.trim()) {
        return failedRun(this.name, files.length, stderr || `exit ${code} on ${file}`);
      }
      try {
        const docs = parseConcatenatedJson(stdout);
        const doc = docs[0] as TexthumanizeJson | undefined;
        if (!doc) continue;
        // 0.05 = ai_patterns density floor: below it a "mixed" verdict is
        // genre noise (formal register); above it phrase-level slop is real.
        const aiPatterns = doc.metrics?.ai_patterns ?? 0;
        if (doc.verdict === "ai" || doc.verdict === "mixed" || aiPatterns > 0.05) {
          findings.push({
            tool: this.name,
            lang,
            file,
            line: null,
            severity: doc.verdict ?? null,
            category: `score=${Number(doc.score).toFixed(2)} ai_patterns=${aiPatterns.toFixed(3)}`,
            quote: ((doc.explanations ?? []).filter(Boolean).join(" | ").slice(0, 200) || null),
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

interface TexthumanizeJson {
  score?: number;
  verdict?: string;
  metrics?: { ai_patterns?: number };
  explanations?: string[];
}
