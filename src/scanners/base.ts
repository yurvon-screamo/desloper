import type { Finding, Lang, ToolRun } from "./types.ts";

export interface ScannerResult {
  run: ToolRun;
  findings: Finding[];
}

export interface Scanner {
  readonly name: string;
  readonly langs: Lang[];
  /** Return true when this scanner's dependencies are available. */
  available(): Promise<boolean>;
  /** Scan files (all of one language per call). */
  scan(files: string[], lang: Lang): Promise<ScannerResult>;
}

/** Common helpers for subprocess scanners. */
export async function runCmd(
  cmd: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1" },
  });
  const timer = opts.timeoutMs
    ? setTimeout(() => proc.kill(), opts.timeoutMs)
    : undefined;
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (timer) clearTimeout(timer);
  return { code, stdout, stderr };
}

export function failedRun(tool: string, files: number, error: string): ScannerResult {
  return {
    run: { tool, ok: false, files, findings: 0, error: error.slice(0, 300) },
    findings: [],
  };
}
