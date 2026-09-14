import { runCmd } from "./scanners/base.ts";
import { join } from "node:path";

/** Non-interactive vendor setup; mirrors config/tools.yaml. */
export async function runSetup(root: string, dryRun: boolean): Promise<boolean> {
  const script = join(root, "setup-vendors.sh");
  const { code, stdout, stderr } = await runCmd(["bash", script, dryRun ? "true" : "false"], {
    cwd: root,
    timeoutMs: 10 * 60_000,
  });
  console.log(stdout);
  if (code !== 0) {
    console.error(stderr);
    return false;
  }
  return true;
}
