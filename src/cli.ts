#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { globSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { detectLang, isConfident } from "./langdetect.ts";
import { triage, type SuppressRule } from "./triage.ts";
import { renderMarkdown } from "./report.ts";
import type { Finding, Lang, Report, ToolRun } from "./scanners/types.ts";
import type { Scanner } from "./scanners/base.ts";
import { TextHumanizeScanner } from "./scanners/texthumanize.ts";
import { AvoidAiWritingScanner } from "./scanners/avoid-ai-writing.ts";
import { ZeroSlopScanner } from "./scanners/zero-slop.ts";
import { HumanizerSkillScanner } from "./scanners/humanizer-skill.ts";
import { HumanizerRuScanner } from "./scanners/humanizer-ru.ts";
import { ImNotAiScanner } from "./scanners/im-not-ai.ts";
import { VietLintScanner } from "./scanners/viet-lint.ts";

const ROOT = join(import.meta.dir, "..");

function usage(): never {
  console.error(`desloper — multilingual AI-slop auditor

Usage:
  desloper [paths...]        scan files/dirs (markdown), report P0-P3
  desloper --setup           install vendors (one-time, no TTY needed)

Options:
  --json          machine-readable report (schema v1) to stdout
  --lang <l>      force language for all files (en|ru|ko|vi)
  --setup         install vendor scanners into vendors/
  --dry-run       with --setup: print planned steps only
  --help          this help
`);
  process.exit(3);
}

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      json: { type: "boolean" },
      lang: { type: "string" },
      setup: { type: "boolean" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: true,
  });
  if (values.help) usage();
  const langOverride = (values.lang as Lang | undefined) ?? null;
  if (langOverride && !["en", "ru", "ko", "vi"].includes(langOverride)) {
    console.error(`--lang must be one of en|ru|ko|vi, got "${langOverride}"`);
    process.exit(3);
  }

  if (values.setup) {
    const { runSetup } = await import("./setup.ts");
    const ok = await runSetup(ROOT, values["dry-run"] ?? false);
    process.exit(ok ? 0 : 2);
  }

  const paths = positionals.length ? positionals : ["."];
  const files = collectFiles(paths);
  if (!files.length) {
    console.error("No markdown files found under: " + paths.join(" "));
    process.exit(3);
  }

  const scanners: Scanner[] = [
    new TextHumanizeScanner(),
    new AvoidAiWritingScanner(),
    new ZeroSlopScanner(),
    new HumanizerSkillScanner(),
    new HumanizerRuScanner(),
    new ImNotAiScanner(),
    new VietLintScanner(),
  ];

  // Group files by language.
  const byLang = new Map<Lang, { file: string; confident: boolean }[]>();
  for (const file of files) {
    const content = await Bun.file(file).text();
    const lang = langOverride ?? detectLang(file, content);
    const bucket = byLang.get(lang) ?? [];
    bucket.push({ file, confident: isConfident(file, content) });
    byLang.set(lang, bucket);
  }

  const toolRuns: ToolRun[] = [];
  const allFindings: Finding[] = [];
  for (const [lang, bucket] of byLang) {
    for (const scanner of scanners) {
      if (!scanner.langs.includes(lang)) continue;
      const avail = await scanner.available();
      if (!avail) {
        toolRuns.push({
          tool: scanner.name,
          ok: false,
          files: bucket.length,
          findings: 0,
          error: "scanner not available — run `desloper --setup`",
        });
        continue;
      }
      const list = bucket.map((b) => b.file);
      const res = await scanner.scan(list, lang);
      toolRuns.push(res.run);
      allFindings.push(...res.findings);
    }
  }

  const suppress = await loadSuppressRules();
  const triaged = triage(allFindings, suppress);
  const report: Report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    tool_runs: toolRuns,
    findings: triaged,
    summary: {
      p0: triaged.filter((f) => !f.fpSuppressed && f.priority === "P0").length,
      p1: triaged.filter((f) => !f.fpSuppressed && f.priority === "P1").length,
      p2: triaged.filter((f) => !f.fpSuppressed && f.priority === "P2").length,
      fp_suppressed: triaged.filter((f) => f.fpSuppressed).length,
      tool_failures: toolRuns.filter((r) => !r.ok).length,
    },
  };

  if (values.json) console.log(JSON.stringify(report, null, 2));
  else console.log(renderMarkdown(report));

  // Exit policy: incomplete audit is never "clean" for CI.
  const exit = report.summary.tool_failures > 0
    ? 2
    : report.summary.p0 + report.summary.p1 > 0 ? 1 : 0;
  process.exit(exit);
}

function collectFiles(paths: string[]): string[] {
  const out = new Set<string>();
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : join(process.cwd(), p);
    if (globSync(abs).length && Bun.file(abs).name.endsWith(".md")) {
      out.add(abs);
      continue;
    }
    // directory or glob: take .md recursively
    const dirGlob = join(abs, "**/*.md");
    for (const f of globSync(dirGlob)) out.add(f);
  }
  return [...out].sort();
}

async function loadSuppressRules(): Promise<SuppressRule[]> {
  const rules: SuppressRule[] = [];
  // Global base (shipped with desloper).
  for (const p of [join(ROOT, "config/exceptions.yaml"), ".desloper.yaml"]) {
    const file = Bun.file(p);
    if (!(await file.exists())) continue;
    const text = await file.text();
    // Minimal YAML subset: "- file: x" / "  tool: y" / "  category: z" / "  quoteContains: q" / "  reason: r"
    let cur: Partial<SuppressRule> | null = null;
    for (const line of text.split("\n")) {
      if (/^suppress:|^rules:|^\s*#/.test(line)) continue;
      const m = line.match(/^\s*-\s+(\w+):\s*(.+)$/) ?? line.match(/^\s+(\w+):\s*(.+)$/);
      if (m) {
        const key = m[1] as keyof SuppressRule;
        if (["file", "tool", "category", "quoteContains"].includes(key)) {
          if (line.trimStart().startsWith("-")) {
            if (cur?.reason) rules.push(cur as SuppressRule);
            cur = {};
          }
          (cur as Record<string, string>)[key] = m[2].replace(/^["']|["']$/g, "");
        } else if (key === "reason") {
          (cur as Record<string, string>)[key] = m[2].replace(/^["']|["']$/g, "");
          if (cur.file || cur.tool || cur.category || cur.quoteContains) rules.push(cur as SuppressRule);
          cur = {};
        }
      }
    }
  }
  return rules;
}

await main();
