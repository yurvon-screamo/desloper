import type { Finding } from "./scanners/types.ts";

/**
 * Triage pipeline (vendor calibration already applied inside scanner
 * wrappers). Order: P0 detection -> P1/P2 classification -> suppression
 * rules. Suppression can only downgrade, never resurrect a finding the
 * vendor's own calibration dropped (known limitation, see
 * docs/false-positives.md).
 */

export interface SuppressRule {
  /** Glob for file path (e.g. "star-star-slash-READMEstar.md" style globs). */
  file?: string;
  tool?: string;
  category?: string;
  /** Substring of the quote to match (case-insensitive). */
  quoteContains?: string;
  reason: string;
}

/** Placeholder/broken-word patterns that are P0 regardless of tool. */
const P0_PATTERNS: RegExp[] = [
  /\[your [a-z ]+\]/i, // unfilled template placeholder: "[your language]"
  /\bINSERT [A-Z ]+\b/,
  /\bLorem ipsum\b/i,
];

/** P1: phrase-level AI tells. P2: structural/rhythm. */
const P1_CATEGORIES = new Set([
  "tier1", "tier1-clarity", "em-dash", "bullet-np-list", "performed-insight",
  "hollow-intensifier", "low-ttr", "cross-para-burstiness", "formatting",
  "dev-blog-boilerplate", "ai-placeholder", "zero-slop-hit", "humanizer-score",
  "ko:risk_band", "p0-placeholder",
]);
const P1_CATEGORY_PREFIXES = ["ru:", "VI-HUM"];
const P2_CATEGORIES = new Set(["linkedin", "triads", "rhythm", "scaffolding"]);

export function triage(
  findings: Finding[],
  suppress: SuppressRule[],
): Finding[] {
  return findings.map((f) => {
    const withPriority = { ...f };
    if (f.priority == null) {
      if (P0_PATTERNS.some((re) => re.test(f.quote ?? ""))) withPriority.priority = "P0";
      else if (f.category && P1_CATEGORIES.has(f.category)) withPriority.priority = "P1";
      else if (f.category && P1_CATEGORY_PREFIXES.some((p) => f.category!.startsWith(p))) withPriority.priority = "P1";
      else if (f.category && P2_CATEGORIES.has(f.category)) withPriority.priority = "P2";
      // Gate convention (upstream corpus calibration): aaw findings below
      // high severity are noise-adjacent unless the per-file count exceeds
      // the 6-findings gate — downgrade to P2, keep visible.
      else if (f.tool === "avoid-ai-writing" && !["high", "critical"].includes(f.severity ?? "")) {
        withPriority.priority = "P2";
      }
      else withPriority.priority = "P1"; // unknown categories default to visible P1
    }
    for (const rule of suppress) {
      if (rule.tool && rule.tool !== f.tool) continue;
      if (rule.category && rule.category !== f.category) continue;
      if (rule.file && !globMatch(rule.file, f.file)) continue;
      if (rule.quoteContains && !(f.quote ?? "").toLowerCase().includes(rule.quoteContains.toLowerCase())) continue;
      withPriority.fpSuppressed = true;
      withPriority.fpReason = rule.reason;
      break;
    }
    return withPriority;
  });
}

function globToRegex(pattern: string): RegExp | null {
  // ** -> \u0000 (cross-directory), then escape literal metacharacters,
  // then expand wildcards — single `*` FIRST so the `.*` we insert for
  // `**` afterwards is not re-expanded. User patterns never inject regex.
  const marked = pattern.replace(/\*\*/g, "\u0000");
  const escaped = marked.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const final = escaped
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")
    .replace(/\?/g, ".");
  try {
    return new RegExp("^" + final + "$");
  } catch {
    return null;
  }
}

function globMatch(pattern: string, path: string): boolean {
  const candidates = [pattern];
  // `**/` also matches zero directories (glob convention), so a
  // "**/*.md" rule must hit root-level files like "a.md" too.
  if (pattern.startsWith("**/")) candidates.push(pattern.slice(3));
  for (const p of candidates) {
    const re = globToRegex(p);
    if (!re) {
      process.stderr.write(`warn: invalid suppression glob "${pattern}" ignored\n`);
      return false;
    }
    if (re.test(path)) return true;
  }
  return false;
}
