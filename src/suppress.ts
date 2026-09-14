import type { SuppressRule } from "./triage.ts";

/**
 * Loader for the suppression YAML subset (global config/exceptions.yaml
 * + per-project .desloper.yaml). Deliberately tiny and forgiving:
 * user config must never crash the audit — malformed blocks are skipped
 * with a stderr warning, blocks without a reason are dropped loudly.
 *
 * Supported shape (order-insensitive within a block):
 *   suppress:
 *     - file: (glob, e.g. double-star-slash-*.md)
 *       category: em-dash
 *       quoteContains: "meta_title"
 *       reason: "SEO title convention"
 */
export function parseSuppressYaml(text: string, source: string): SuppressRule[] {
  const rules: SuppressRule[] = [];
  let inSuppress = false;
  let cur: Partial<SuppressRule> | null = null;
  const push = () => {
    if (!cur) return;
    if (!cur.reason) {
      process.stderr.write(
        `warn: ${source}: suppression block without reason skipped (${JSON.stringify({ ...cur, reason: undefined })})\n`,
      );
    } else if (cur.file || cur.tool || cur.category || cur.quoteContains) {
      rules.push(cur as SuppressRule);
    }
    cur = null;
  };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (/^\s*#/.test(line) || !line.trim()) continue;
    if (/^suppress\s*:/.test(line)) { inSuppress = true; continue; }
    if (/^\S/.test(line)) { inSuppress = false; continue; } // any other top-level key
    if (!inSuppress) continue;
    const item = line.match(/^\s*-\s*(.*)$/);
    if (item) {
      push(); // previous block done
      cur = {};
      const kv = item[1].match(/^(\w+)\s*:\s*(.*)$/);
      if (kv) setKey(cur, kv[1], kv[2]);
      continue;
    }
    const kv = line.match(/^\s+(\w+)\s*:\s*(.*)$/);
    if (kv && cur) setKey(cur, kv[1], kv[2]);
  }
  push();
  return rules;
}

const KNOWN = new Set(["file", "tool", "category", "quoteContains", "reason"]);
function setKey(cur: Partial<SuppressRule>, key: string, value: string) {
  if (!KNOWN.has(key)) {
    process.stderr.write(`warn: unknown suppression key "${key}" ignored\n`);
    return;
  }
  const v = value.replace(/^["']|["']$/g, "");
  (cur as Record<string, string>)[key] = v;
}

export async function loadSuppressRules(builtinPath: string, projectPath: string): Promise<SuppressRule[]> {
  const rules: SuppressRule[] = [];
  for (const [p, label] of [[builtinPath, "builtin"], [projectPath, "project"]] as const) {
    const f = Bun.file(p);
    if (!(await f.exists())) continue;
    rules.push(...parseSuppressYaml(await f.text(), label === "builtin" ? p : p));
  }
  return rules;
}
