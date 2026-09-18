#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { globSync, existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { detectLang, isConfident } from "./langdetect.ts";
import { triage } from "./triage.ts";
import { loadSuppressRules } from "./suppress.ts";
import { configPath } from "./paths.ts";
import { scanP0 } from "./scanners/p0.ts";
import { renderMarkdown } from "./report.ts";
import type { Finding, Lang, Report, ToolRun } from "./scanners/types.ts";
import type { Scanner } from "./scanners/base.ts";
import { PhraseScanner } from "./scanners/phrase.ts";
import { AvoidAiWritingScanner } from "./scanners/avoid-ai-writing.ts";
import { PatternScanner } from "./scanners/pattern-en.ts";
import { MetricsScanner } from "./scanners/metrics-scanner.ts";
import { HumanizerRuScanner } from "./scanners/humanizer-ru.ts";
import { ImNotAiScanner } from "./scanners/im-not-ai.ts";
import { ViBuiltinScanner } from "./scanners/vi-builtin.ts";

function usage(code = 3): never {
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
  process.exit(code);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
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
  } catch (e) {
    // Unknown flag / usage error must be exit 3, never a stack trace
    // (exit 1 means "findings present").
    console.error(String(e));
    usage(3);
  }
  const { values, positionals } = parsed;
  if (values.help) usage(0);
  const langOverride = (values.lang as Lang | undefined) ?? null;
  if (langOverride && !["en", "ru", "ko", "vi"].includes(langOverride)) {
    console.error(`--lang must be one of en|ru|ko|vi, got "${langOverride}"`);
    process.exit(3);
  }

  if (values.setup) {
    const { runSetup } = await import("./setup.ts");
    const ok = await runSetup(values["dry-run"] ?? false);
    process.exit(ok ? 0 : 2);
  }

  const paths = positionals.length ? positionals : ["."];
  const files = collectFiles(paths);
  if (!files.length) {
    console.error("No markdown files found under: " + paths.join(" "));
    process.exit(3);
  }

  const scanners: Scanner[] = [
    new PhraseScanner(),
    new AvoidAiWritingScanner(),
    new PatternScanner(),
    new MetricsScanner(),
    new HumanizerRuScanner(),
    new ImNotAiScanner(),
    new ViBuiltinScanner(),
  ];

  // Group files by language; vendor-independent P0 scan runs on raw content.
  const byLang = new Map<Lang, { file: string; confident: boolean }[]>();
  const uncertainFiles: string[] = [];
  const contents = new Map<string, string>();
  for (const file of files) {
    const content = await Bun.file(file).text();
    contents.set(file, content);
    const lang = langOverride ?? detectLang(file, content);
    const bucket = byLang.get(lang) ?? [];
    const confident = isConfident(file, content);
    bucket.push({ file, confident });
    if (!langOverride && !confident) uncertainFiles.push(file);
    byLang.set(lang, bucket);
  }

  const toolRuns: ToolRun[] = [];
  const allFindings: Finding[] = [];
  for (const [lang, bucket] of byLang) {
    // Built-in P0 pass: placeholders must surface even when every
    // vendor scanner reports the file as clean.
    let p0Count = 0;
    for (const { file } of bucket) {
      const res = scanP0(file, contents.get(file) ?? "", lang);
      p0Count += res.run.findings;
      allFindings.push(...res.findings);
    }
    toolRuns.push({ tool: "desloper", ok: true, files: bucket.length, findings: p0Count, error: null });

    for (const scanner of scanners) {
      if (!scanner.langs.includes(lang)) continue;
      const avail = await scanner.available();
      if (!avail) {
        toolRuns.push({
          tool: scanner.name,
          ok: false,
          files: bucket.length,
          findings: 0,
          error: "scanner not available (run `desloper --setup` for vendor scanners; built-in scanners ship with the repo)",
        });
        continue;
      }
      const list = bucket.map((b) => b.file);
      const res = await scanner.scan(list, lang, contents);
      toolRuns.push(res.run);
      allFindings.push(...res.findings);
    }
  }

  const suppress = await loadSuppressRules(configPath("exceptions.yaml"), ".desloper.yaml");
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

  if (values.json) {
    const json = { ...report, language_uncertain: uncertainFiles };
    console.log(JSON.stringify(json, null, 2));
  } else {
    console.log(renderMarkdown(report, uncertainFiles));
  }

  // Exit policy: incomplete audit is never "clean" for CI.
  const exit = report.summary.tool_failures > 0
    ? 2
    : report.summary.p0 + report.summary.p1 > 0 ? 1 : 0;
  process.exit(exit);
}

function collectFiles(paths: string[]): string[] {
  const out = new Set<string>();
  // Never audit dependency/vendor content by default — a bare `desloper`
  // on a JS repo would otherwise drag in hundreds of third-party READMEs.
  const isExcluded = (p: string) =>
    /(^|\/)(node_modules|vendors|\.git|\.venv)(\/|$)/.test(p);
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : join(process.cwd(), p);
    if (isExcluded(abs)) continue;
    if (abs.endsWith(".md") && existsSync(abs)) {
      out.add(abs);
      continue;
    }
    // directory or glob: take .md recursively; excluded dirs are pruned
    // from the result set (Bun's glob has no traversal-level ignore yet,
    // so node_modules is walked but filtered — documented tradeoff)
    const dirGlob = join(abs, "**/*.md");
    for (const f of globSync(dirGlob)) {
      if (!isExcluded(f)) out.add(f);
    }
  }
  return [...out].sort();
}

await main();
