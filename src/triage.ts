import type { Finding } from "./scanners/types.ts";

import { P0_PATTERNS } from "./scanners/p0.ts";

/**
 * Triage pipeline (vendor calibration already applied inside scanner
 * wrappers). Order: P0 detection -> gate check -> P1/P2 classification
 * -> suppression rules. Suppression can only downgrade, never resurrect
 * a finding the vendor's own calibration dropped (known limitation,
 * see docs/false-positives.md). P0 patterns live in scanners/p0.ts —
 * single source for both the vendor-independent scanner and triage.
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

/** P1: phrase-level AI tells. P2: structural/rhythm. */
const P1_CATEGORIES = new Set([
  "tier1", "tier1-clarity", "em-dash", "bullet-np-list", "performed-insight",
  "hollow-intensifier", "low-ttr", "cross-para-burstiness", "formatting",
  "dev-blog-boilerplate", "ai-placeholder", "zero-slop-hit", "humanizer-score",
  "ko:risk_band", "p0-placeholder",
  // natural-japanese phrase/template-level tells; every other ja: category
  // is rhythm/structure and lives in P2_CATEGORIES below.
  "ja:forbidden_phrase", "ja:antithesis_repetition", "ja:boilerplate_heading",
  "ja:double_negative",
  // es-lint phrase-level tells (catalog absorbed as data); every other
  // es: category is structural and lives in P2_CATEGORIES below.
  "es:pomposity_frame", "es:conclusion_announcer",
]);
const P1_CATEGORY_PREFIXES = ["ru:", "VI-HUM", "zs:"];
const P2_CATEGORIES = new Set([
  "linkedin", "triads", "rhythm", "scaffolding", "ru:dash-density",
  // natural-japanese rhythm/structure detectors (category-based mapping:
  // vendor severity is a hint, not the priority axis — low_sentence_variance
  // emits warn but is rhythm = P2). Unknown ja: categories are NOT listed
  // here, so vendor updates default to visible P1, never silent P2.
  "ja:low_burstiness", "ja:low_sentence_variance", "ja:uniform_paragraph_structure",
  "ja:high_length_autocorrelation", "ja:nominal_ending", "ja:translationese",
  "ja:translationese_morph", "ja:english_syntax_cleft_because",
  "ja:english_syntax_inanimate_subject", "ja:inanimate_subject_morph",
  "ja:repeated_sentence_lead", "ja:repeated_syntax_template",
  "ja:paragraph_lead_conjunction", "ja:low_lexical_diversity_mtld",
  "ja:low_lexical_diversity_ttr", "ja:low_specificity", "ja:sentence_too_long",
  "ja:kanji_run", "ja:no_chain", "ja:numbered_phase_structure", "ja:buried_list",
  "ja:high_bold_density", "ja:high_bullet_ratio", "ja:high_emoji_symbol_density",
  // ja-lint (textlint-ja preset absorbed as data): formatting rules and
  // the weak-intensifier hype subset are P2 material (upstream itself is
  // suggestion-level there); strong hype H02/H03 default to visible P1.
  "JA-AI-L01", "JA-AI-L02", "JA-AI-E01", "JA-AI-E02", "JA-AI-E03", "JA-AI-H01",
  // es-lint structural detectors. Unknown es: categories are NOT listed
  // here — vendor/catalog updates default to visible P1, never silent P2.
  "es:paragraph_connector", "es:triads", "es:mente_adverb_chain",
  "es:poder_infinitivo", "es:em_dash_inciso",
]);

/** Upstream corpus calibration: aaw allows up to 6 findings per file. */
const AAW_GATE = 6;

export function triage(
  findings: Finding[],
  suppress: SuppressRule[],
): Finding[] {
  // aaw per-file gate: a file exceeding AAW_GATE findings is itself a
  // signal — its sub-high severities are upgraded back to P1.
  const aawPerFile = new Map<string, number>();
  for (const f of findings) {
    if (f.tool === "avoid-ai-writing") {
      aawPerFile.set(f.file, (aawPerFile.get(f.file) ?? 0) + 1);
    }
  }
  return findings.map((f) => {
    const withPriority = { ...f };
    const gateBroken = f.tool === "avoid-ai-writing" &&
      (aawPerFile.get(f.file) ?? 0) > AAW_GATE;
    if (f.priority == null) {
      if (P0_PATTERNS.some((re) => re.test(f.quote ?? ""))) withPriority.priority = "P0";
      else if (f.category && P1_CATEGORIES.has(f.category)) withPriority.priority = "P1";
      // Exact category match beats taxonomy prefixes: "ru:dash-density"
      // must take the P2 route below, not the generic "ru:" P1 prefix.
      else if (f.category && P2_CATEGORIES.has(f.category)) withPriority.priority = "P2";
      else if (f.category && P1_CATEGORY_PREFIXES.some((p) => f.category!.startsWith(p))) withPriority.priority = "P1";
      // Sub-high aaw findings are noise-adjacent P2 — unless the file
      // breaks the upstream 6-findings gate, then everything is P1.
      else if (f.tool === "avoid-ai-writing" && !["high", "critical"].includes(f.severity ?? "") && !gateBroken) {
        withPriority.priority = "P2";
      }
      else if (f.severity === "weak") {
        // Weak signals: bureaucratic phrases / connectors surfacing in
        // repetition — structural rather than phrase-level slop.
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
    .replace(/\?/g, "[^/]");
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
