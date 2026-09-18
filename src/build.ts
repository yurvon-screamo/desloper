import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

/**
 * Build compiled desloper binaries: bun src/build.ts [target ...]
 * Targets default to the full matrix. The artifact built for THIS
 * platform is smoke-tested (fixtures audit through the binary itself);
 * cross-compiled artifacts are verified by the clean-room CI job.
 */
const REPO_ROOT = join(import.meta.dir, "..");
const ALL_TARGETS = ["bun-linux-x64", "bun-darwin-arm64"] as const;
type Target = (typeof ALL_TARGETS)[number];

const nativeCandidate = `bun-${process.platform}-${process.arch}`;
const NATIVE: Target | null = ALL_TARGETS.find((t) => t === nativeCandidate) ?? null;

function outfileFor(target: Target): string {
  // bun-<os>-<arch> → <os>-<arch>, version from package.json (SSOT).
  return join(REPO_ROOT, "dist", `desloper-${pkg.version}-${target.replace(/^bun-/, "")}`);
}

function build(target: Target): void {
  const outfile = outfileFor(target);
  console.log(`==> build ${target} → ${outfile}`);
  const proc = Bun.spawnSync(
    ["bun", "build", "--compile", "src/cli.ts", `--target=${target}`, `--outfile=${outfile}`],
    { cwd: REPO_ROOT, stdout: "inherit", stderr: "inherit" },
  );
  if (proc.exitCode !== 0) {
    throw new Error(`build failed for ${target} (exit ${proc.exitCode})`);
  }
}

/** End-to-end smoke of the native artifact: audit the EN fixtures and
 *  expect the exact contract a vendor-less machine produces — built-in
 *  EN scanners find slop, no tool failures, exit 1 (findings present). */
function smoke(outfile: string): void {
  console.log(`==> smoke ${outfile} tests/fixtures/en`);
  const proc = Bun.spawnSync([outfile, "tests/fixtures/en", "--json"], {
    cwd: REPO_ROOT,
    stdout: "pipe",
  });
  if (proc.exitCode !== 1) {
    throw new Error(`smoke: expected exit 1 (findings present), got ${proc.exitCode}`);
  }
  const stdout = new TextDecoder().decode(proc.stdout);
  let report: {
    summary: { p0: number; tool_failures: number };
    tool_runs: { tool: string; findings: number; ok: boolean }[];
  };
  try {
    report = JSON.parse(stdout);
  } catch {
    throw new Error(`smoke: artifact did not emit a JSON report. Output head: ${stdout.slice(0, 200)}`);
  }
  if (report.summary.tool_failures !== 0) {
    throw new Error("smoke: tool failures present, audit incomplete");
  }
  const findings = (tool: string): number =>
    report.tool_runs.filter((r) => r.tool === tool).reduce((acc, r) => acc + r.findings, 0);
  for (const tool of ["avoid-ai-writing", "patterns-en", "phrases", "desloper"]) {
    if (findings(tool) < 1) {
      throw new Error(`smoke: built-in scanner ${tool} produced zero findings on fixtures`);
    }
  }
  console.log(`OK: smoke passed (p0=${report.summary.p0}, all built-in EN scanners active)`);
}

const requested = Bun.argv.slice(2);
const targets = (requested.length ? requested : [...ALL_TARGETS]) as Target[];
for (const target of targets) {
  if (!(ALL_TARGETS as readonly string[]).includes(target)) {
    console.error(`unknown target: ${target} (known: ${ALL_TARGETS.join(", ")})`);
    process.exit(3);
  }
  build(target);
}
if (NATIVE && targets.includes(NATIVE)) {
  smoke(outfileFor(NATIVE));
}
