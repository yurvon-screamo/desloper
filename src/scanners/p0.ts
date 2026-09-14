import type { Finding, Lang, ToolRun } from "./types.ts";

/**
 * Built-in P0 scanner — vendor-independent. A file whose only defect is
 * an unfilled placeholder would otherwise scan "clean" (detectors may
 * have zero findings on it). Reads raw content; no subprocess involved.
 */
/** Placeholder/broken-word patterns that are P0 regardless of tool.
 * Single source of truth: used by the vendor-independent P0 scanner
 * and by triage for vendor-quote matching. */
export const P0_PATTERNS: RegExp[] = [
  /\[your [a-z ]{2,30}\]/i, // unfilled template placeholder: "[your language]"
  /\bINSERT [A-Z][A-Z ]{2,30}\b/,
  /\bLorem ipsum\b/i,
];

export function scanP0(file: string, content: string, lang: Lang, files = 1): { run: ToolRun; findings: Finding[] } {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (const re of P0_PATTERNS) {
    const gre = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = gre.exec(content))) {
      const line = content.slice(0, m.index).split("\n").length;
      const lineText = lines[line - 1] ?? "";
      if (lineText.trimStart().startsWith("<!--") || lineText.includes("```")) continue;
      findings.push({
        tool: "desloper",
        lang,
        file,
        line,
        severity: "critical",
        category: "p0-placeholder",
        quote: `${m[0]}`,
        priority: "P0",
        fpSuppressed: false,
        fpReason: null,
      });
      if (m.index === gre.lastIndex) gre.lastIndex++; // zero-width guard
    }
  }
  return {
    run: { tool: "desloper", ok: true, files, findings: findings.length, error: null },
    findings,
  };
}
