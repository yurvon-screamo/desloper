import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { runCmd } from "./scanners/base.ts";
import { configPath, isCompiled, setupScriptPath, vendorsDir } from "./paths.ts";

/** Non-interactive vendor setup; mirrors config/tools.yaml.
 *
 *  Dev checkouts run the repo script and config in place. Compiled
 *  binaries materialize both embedded assets into a temp directory
 *  first: external bash cannot read the virtual $bunfs paths that
 *  Bun.file() resolves inside the process. */
export async function runSetup(dryRun: boolean): Promise<boolean> {
  const vendors = vendorsDir();
  if (!isCompiled()) {
    return execSetup(setupScriptPath(), configPath("tools.yaml"), vendors, dryRun);
  }
  const work = mkdtempSync(join(tmpdir(), "desloper-setup-"));
  try {
    const script = join(work, "setup-vendors.sh");
    const toolsYaml = join(work, "tools.yaml");
    await Bun.write(script, await Bun.file(setupScriptPath()).text());
    await Bun.write(toolsYaml, await Bun.file(configPath("tools.yaml")).text());
    return await execSetup(script, toolsYaml, vendors, dryRun);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function execSetup(
  script: string,
  toolsYaml: string,
  vendors: string,
  dryRun: boolean,
): Promise<boolean> {
  const { code, stdout, stderr } = await runCmd(
    ["bash", script, dryRun ? "true" : "false", vendors, toolsYaml],
    { timeoutMs: 10 * 60_000 },
  );
  console.log(stdout);
  if (code !== 0) {
    console.error(stderr);
    return false;
  }
  return true;
}
