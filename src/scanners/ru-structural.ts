import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";

/**
 * Built-in RU structural scanner: catches paragraph-level tells that
 * phrase dictionaries and the RU vendor scanner miss (issue ground
 * truth: a human reviewer rejected texts every tool passed clean).
 *
 * Three detectors:
 * 1. fragment leads — a stub sentence opening a substantial paragraph,
 *    or a stub paragraph acting as a lead into the next one. Presence
 *    of a nominal one-word label ("Методика.") stays clean.
 * 2. em-dash density — "—" used as a universal connector. Dash
 *    PRESENCE is Russian typographic norm (globally suppressed for the
 *    humanizer-ru category); only DENSITY is a tell. Paired
 *    constructions (2) stay clean, 3+ flags.
 * 3. arrows in prose — "→" outside code blocks/tables, except
 *    digit-flanked progression notation ("N5 → N1"), a documented
 *    global false positive (docs/false-positives.md).
 *
 * Zero subprocess, zero network, no data files: the rules are
 * aggregate (paragraph parsing, counters), thresholds are calibrated
 * against the issue ground truth and live in the constants below.
 */

/** Stub lead longer than this is a normal opening sentence. */
const LEAD_MAX_CHARS = 35;
/** A stub is a tell only when it opens a substantial body (issue
 *  example: "Что делал." + 111-char body must flag). */
const BODY_MIN_CHARS = 100;
/** Paired dash constructions (2) are legitimate; 3+ is connector abuse
 *  (issue author had 6+ per paragraph, human-fixed text has 0-2). */
const DASH_DENSITY_THRESHOLD = 3;
/** 5+ dashes in one paragraph reads as machine-written prose. */
const DASH_HIGH_SEVERITY = 5;
/** One-word stubs are run-in labels ("Методика."), not fragments. */
const LEAD_MIN_WORDS = 2;

const ARROW = "→";
const DASH = "—";

interface Paragraph {
  /** 1-based line number of the paragraph's first line. */
  startLine: number;
  lines: string[];
  text: string;
}

/** True when paragraph B starts right after paragraph A (one blank
 *  line between). A structural block (code, table, list, break) in
 *  between breaks the lead relation: a stub introducing its own code
 *  sample is not a fragment lead. */
function isAdjacent(a: Paragraph, b: Paragraph): boolean {
  return b.startLine - (a.startLine + a.lines.length - 1) === 2;
}

/** Lines that never participate in prose paragraphs: indented code
 *  (4 spaces / tab — checked on the RAW line: trim() would erase the
 *  evidence), headings, blockquotes, tables, list items (including
 *  typographic dash bullets), thematic breaks, setext underlines,
 *  HTML comments. */
function isStructuralLine(line: string): boolean {
  if (line.startsWith("    ") || line.startsWith("\t")) return true;
  const trimmed = line.trim();
  return trimmed.length === 0 ||
    trimmed.startsWith("#") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("|") ||
    trimmed.startsWith("<!--") ||
    trimmed.startsWith("- ") ||
    trimmed.startsWith("* ") ||
    trimmed.startsWith("+ ") ||
    /^[—–-]\s/.test(trimmed) ||
    /^\d+[.)]\s/.test(trimmed) ||
    // thematic break (--- *** ___) and setext H1 underline (===):
    // both must split paragraphs or stub/body detection drifts
    /^([—–_*-])\s*(\1\s*){2,}$/.test(trimmed) ||
    /^={3,}$/.test(trimmed);
}

function parseProseParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  let inFence = false;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      current = null;
      continue;
    }
    if (inFence || isStructuralLine(line)) {
      current = null;
      continue;
    }
    if (current) {
      current.lines.push(line);
      current.text += "\n" + line;
    } else {
      current = { startLine: i + 1, lines: [line], text: line };
      paragraphs.push(current);
    }
  }
  return paragraphs;
}

/** Single-letter and multi-letter Russian abbreviations whose dot must
 *  not end a sentence: "т. е.", "и т. д.", "г.", "см.", "вв.". */
const RU_ABBREVS = new Set([
  "т", "и", "д", "п", "г", "ч", "к", "у", "об", "н", "о",
  "см", "рис", "стр", "вв", "тыс", "млн", "млрд", "пр", "др", "пп", "ул",
]);

/** Exported for the abbreviation-boundary probe test (same pattern as
 *  compilePyRegex in vi-builtin.ts): the RU_ABBREVS branch has no
 *  observable fragment-lead verdict change (stub cutting skips invalid
 *  boundaries), so the contract is pinned directly. */
export function isSentenceBoundary(text: string, punctIndex: number): boolean {
  const next = text[punctIndex + 1];
  if (next !== undefined && !/\s/.test(next)) return false; // "2.5 раза"
  const wordAfter = text.slice(punctIndex + 1).match(/^\s+(\S)/);
  if (wordAfter && /\d/.test(wordAfter[1])) return false; // "в 2.5 раза"
  const word = text.slice(0, punctIndex).match(/(\S+)$/)?.[1] ?? "";
  if (word.length <= 1) return false; // initials: "И. И. Иванов", "т. е."
  return !RU_ABBREVS.has(word.toLowerCase());
}

function firstSentence(text: string): { stub: string; rest: string } {
  for (const end of text.matchAll(/[.!?…]/g)) {
    if (isSentenceBoundary(text, end.index)) {
      const cut = end.index + 1;
      return { stub: text.slice(0, cut).trim(), rest: text.slice(cut).trim() };
    }
  }
  return { stub: text.trim(), rest: "" };
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Dashes opening a wrapped line are typographic bullets, not connectors. */
function countProseDashes(paragraph: Paragraph): number {
  let count = 0;
  for (const line of paragraph.lines) {
    const firstCharOffset = line.length - line.trimStart().length;
    const from = line[firstCharOffset] === DASH ? firstCharOffset + 1 : 0;
    for (const ch of line.slice(from)) {
      if (ch === DASH) count++;
    }
  }
  return count;
}

/** Progression notation exemption ("N5 → N1", "30 → 50"): both tokens
 *  adjacent to the arrow contain digits. Token-based, not regex over
 *  the gap, so "(N5) → N1" stays exempt too. */
function isDigitFlanked(line: string, arrowIndex: number): boolean {
  const leftToken = line.slice(0, arrowIndex).match(/(\S+)\s*$/)?.[1] ?? "";
  const rightToken = line.slice(arrowIndex + 1).match(/^\s*(\S+)/)?.[1] ?? "";
  return /\d/.test(leftToken) && /\d/.test(rightToken);
}

function countProseArrows(line: string): number {
  let count = 0;
  let arrowIndex = line.indexOf(ARROW);
  while (arrowIndex !== -1) {
    if (!isDigitFlanked(line, arrowIndex)) count++;
    arrowIndex = line.indexOf(ARROW, arrowIndex + 1);
  }
  return count;
}

function mk(
  tool: string,
  lang: Lang,
  file: string,
  line: number,
  category: string,
  severity: string,
  quote: string,
): Finding {
  return {
    tool,
    lang,
    file,
    line,
    severity,
    category,
    quote: quote.slice(0, 200),
    priority: null,
    fpSuppressed: false,
    fpReason: null,
  };
}

function scanFile(tool: string, file: string, lang: Lang, content: string): Finding[] {
  const findings: Finding[] = [];
  const paragraphs = parseProseParagraphs(content);

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    // Detector 1a: stub sentence opening a substantial paragraph.
    const { stub, rest } = firstSentence(paragraph.text);
    if (
      stub.length < LEAD_MAX_CHARS && stub.length > 0 &&
      wordCount(stub) >= LEAD_MIN_WORDS &&
      rest.length >= BODY_MIN_CHARS
    ) {
      findings.push(mk(tool, lang, file, paragraph.startLine, "ru:fragment-lead", "medium", stub));
    }
    // Detector 1b: stub paragraph leading into the next one. The lead
    // relation requires direct adjacency: a closer (nothing substantial
    // after) or a stub introducing its own code/table/list is legitimate.
    const trimmed = paragraph.text.trim();
    const next = paragraphs[i + 1];
    if (
      trimmed.length < LEAD_MAX_CHARS &&
      /[.!?…]$/.test(trimmed) &&
      wordCount(trimmed) >= LEAD_MIN_WORDS &&
      next != null && isAdjacent(paragraph, next) &&
      next.text.trim().length >= BODY_MIN_CHARS
    ) {
      findings.push(mk(tool, lang, file, paragraph.startLine, "ru:fragment-lead", "medium", trimmed));
    }
    // Detector 2: em-dash density per paragraph (content quote keeps
    // per-project quoteContains suppression possible).
    const dashCount = countProseDashes(paragraph);
    if (dashCount >= DASH_DENSITY_THRESHOLD) {
      findings.push(
        mk(tool, lang, file, paragraph.startLine, "ru:dash-density",
          dashCount >= DASH_HIGH_SEVERITY ? "high" : "medium",
          `×${dashCount} ${paragraph.text.replace(/\s+/g, " ").trim()}`),
      );
    }
    // Detector 3: arrows in prose lines (per-line, digit-flanked exempt).
    for (let j = 0; j < paragraph.lines.length; j++) {
      const arrowCount = countProseArrows(paragraph.lines[j]);
      if (arrowCount > 0) {
        findings.push(
          mk(tool, lang, file, paragraph.startLine + j, "ru:arrow-prose",
            arrowCount >= 2 ? "high" : "medium",
            `${paragraph.lines[j].trim()}${arrowCount > 1 ? ` ×${arrowCount}` : ""}`),
        );
      }
    }
  }
  return findings;
}

export class RuStructuralScanner implements Scanner {
  readonly name = "ru-structural";
  readonly langs: Lang[] = ["ru"];

  async available(): Promise<boolean> {
    return true;
  }

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      findings.push(...scanFile(this.name, file, lang, content));
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}
