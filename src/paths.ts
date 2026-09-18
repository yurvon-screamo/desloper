import { join } from "node:path";
import { homedir } from "node:os";
import exceptionsYaml from "../config/exceptions.yaml" with { type: "file" };
import toolsYaml from "../config/tools.yaml" with { type: "file" };
import zeroSlopPatterns from "../config/dictionaries/zero-slop-patterns.json" with { type: "file" };
import texthumanizeDicts from "../config/dictionaries/texthumanize-dicts.json" with { type: "file" };
import viPatterns from "../config/dictionaries/vi-patterns.json" with { type: "file" };
import setupVendorsScript from "../setup-vendors.sh" with { type: "file" };

/**
 * Single source of path resolution for the CLI and every scanner.
 *
 * In dev checkouts import.meta.dir is the real src/ directory. In
 * compiled binaries (`bun build --compile`) it points into the virtual
 * $bunfs filesystem: paths derived from it are readable ONLY via
 * Bun.file() inside this process, never by an external process
 * (spawned bash/python cannot see $bunfs). Everything that crosses a
 * process boundary goes through vendorsDir(), which always resolves to
 * a real filesystem location.
 */

const ROOT = join(import.meta.dir, "..");

const CONFIG_ASSETS = {
  "exceptions.yaml": exceptionsYaml,
  "tools.yaml": toolsYaml,
  "dictionaries/zero-slop-patterns.json": zeroSlopPatterns,
  "dictionaries/texthumanize-dicts.json": texthumanizeDicts,
  "dictionaries/vi-patterns.json": viPatterns,
} as const;

export type ConfigAsset = keyof typeof CONFIG_ASSETS;

/** Path of a shipped config asset, Bun.file()-valid in dev and compiled
 *  builds alike. Never pass it across a process boundary. */
export function configPath(name: ConfigAsset): string {
  return CONFIG_ASSETS[name];
}

/** Path of the vendor-install script (embedded asset, same opacity
 *  rule as configPath). */
export function setupScriptPath(): string {
  return setupVendorsScript;
}

/** True when running from a compiled binary (virtual $bunfs paths).
 *  Compiled Bun binaries mount the entrypoint under /$bunfs; a real
 *  checkout never resolves there. */
export function isCompiled(): boolean {
  return import.meta.dir.startsWith("/$bunfs/");
}

/** Platform-default per-user data directory (XDG_DATA_HOME honored on
 *  Linux, ~/Library/Application Support on macOS). */
function defaultDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(xdg, "desloper");
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "desloper");
  }
  return join(homedir(), ".local", "share", "desloper");
}

/** Real-filesystem directory holding the vendor scanners (RU/KO).
 *  Resolution: DESLOPER_VENDORS env → repo vendors/ in dev checkouts
 *  → platform data dir for compiled binaries. */
export function vendorsDir(): string {
  const envDir = process.env.DESLOPER_VENDORS;
  if (envDir) return envDir;
  if (!isCompiled()) return join(ROOT, "vendors");
  return join(defaultDataDir(), "vendors");
}
