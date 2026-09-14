import type { Finding, Lang, ToolRun } from "./types.ts";

/**
 * Built-in P0 scanner — vendor-independent. A file whose only defect is
 * an unfilled placeholder would otherwise scan "clean" (detectors may
 * have zero findings on it). Reads raw content; no subprocess involved.
 */
const P0_REGEXPS: [RegExp, string][] = [
  [/\[your [a-z ]{2,30}\]/gi, "unfilled template placeholder"],
  [/\bINSERT [A-Z][A-Z _]{2,30}\b/g, "unfilled INSERT placeholder"],
  [/\bLorem ipsum\b/gi, "lorem ipsum"],
];

export function scanP0(file: string, content: string, lang: Lang): { run: ToolRun; findings: Finding[] } {
  const findings: Finding[] = [];
  const lines = content.split("\n");
  for (const [re, label] of P0_REGEXPS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      const line = content.slice(0, m.index).split("\n").length;
      // skip markdownlint HTML comments and code fences context (rough)
      const lineText = lines[line - 1] ?? "";
      if (lineText.trimStart().startsWith("<!--") || lineText.includes("```")) continue;
      findings.push({
        tool: "desloper",
        lang,
        file,
        line,
        severity: "critical",
        category: "p0-placeholder",
        quote: `${m[0]} — ${label}`,
        priority: "P0",
        fpSuppressed: false,
        fpReason: null,
      });
      if (m.index === re.lastIndex) re.lastIndex++; // zero-width guard
    }
  }
  return {
    run: { tool: "desloper", ok: true, files: 1, findings: findings.length, error: null },
    findings,
  };
}
