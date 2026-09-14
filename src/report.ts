import type { Finding, Report } from "./scanners/types.ts";

/** Render the human-readable markdown report to stdout. */
export function renderMarkdown(report: Report, uncertainFiles: string[] = []): string {
  const lines: string[] = [];
  const s = report.summary;
  lines.push(`# desloper report`);
  lines.push("");
  lines.push(
    `**P0 (placeholders/broken): ${s.p0} · P1 (phrase patterns): ${s.p1} · ` +
      `P2 (structural): ${s.p2} · FP suppressed: ${s.fp_suppressed} · tool failures: ${s.tool_failures}**`,
  );
  lines.push("");
  if (uncertainFiles.length) {
    lines.push(`> ℹ️ Language auto-detect was inconclusive for ${uncertainFiles.length} file(s); ` +
      `they were scanned with EN tools — use \`--lang\` to override:`);
    for (const f of uncertainFiles.slice(0, 10)) lines.push(`> - ${f}`);
    lines.push("");
  }
  if (s.tool_failures > 0) {
    lines.push(`> ⚠️ Some scanners failed — this audit is INCOMPLETE (exit 2):`);
    for (const r of report.tool_runs.filter((r) => !r.ok)) {
      lines.push(`> - \`${r.tool}\`: ${r.error}`);
    }
    lines.push("");
  }
  const active = report.findings.filter((f) => !f.fpSuppressed);
  const suppressed = report.findings.filter((f) => f.fpSuppressed);
  for (const prio of ["P0", "P1", "P2"] as const) {
    const group = active.filter((f) => f.priority === prio);
    if (!group.length) continue;
    lines.push(`## ${prio} — ${group.length}`);
    lines.push("");
    for (const f of group) {
      const quote = (f.quote ?? "").replace(/[\n\r]+/g, " ⏎ ").replace(/([*_`#>|])/g, "\\$1");
      lines.push(
        `- **${f.file}${f.line != null ? `:${f.line}` : ""}** ` +
          `[\`${f.tool}\`/\`${f.category ?? "?"}\`${f.severity ? ` ${f.severity}` : ""}] ${quote}`,
      );
    }
    lines.push("");
  }
  if (suppressed.length) {
    lines.push(`## Suppressed as documented false positives — ${suppressed.length}`);
    lines.push("");
    for (const f of suppressed) {
      lines.push(`- ${f.file} [\`${f.tool}\`/\`${f.category ?? "?"}\`]: ${f.fpReason}`);
    }
    lines.push("");
  }
  if (!active.length && !suppressed.length) {
    lines.push(`No findings. 🎉`);
  }
  return lines.join("\n");
}
