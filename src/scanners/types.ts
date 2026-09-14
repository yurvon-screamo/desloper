/** A single finding produced by any scanner, normalized across vendors. */
export interface Finding {
  tool: string;
  lang: Lang;
  file: string;
  line: number | null;
  /** Vendor severity as reported (e.g. "high", "S1", "medium"). */
  severity: string | null;
  /** Vendor category (e.g. "em-dash", "tier1", "VI-HUM-S01", "번역투"). */
  category: string | null;
  /** The matched text / evidence quote. */
  quote: string | null;
  /** Desloper priority after triage: P0 placeholder/broken, P1 phrase-level, P2 structural. */
  priority: "P0" | "P1" | "P2" | null;
  /** True when triage suppressed this finding as a documented false positive. */
  fpSuppressed: boolean;
  /** Why it was suppressed (from exceptions config), for report transparency. */
  fpReason: string | null;
}

export type Lang = "en" | "ru" | "ko" | "vi";

/** Per-scanner run outcome. */
export interface ToolRun {
  tool: string;
  ok: boolean;
  /** Files scanned by this tool. */
  files: number;
  /** Findings before triage (post vendor-own calibration). */
  findings: number;
  /** Error message when ok === false. */
  error: string | null;
}

/** Top-level report contract (schema v1). */
export interface Report {
  schema_version: 1;
  generated_at: string;
  tool_runs: ToolRun[];
  findings: Finding[];
  summary: {
    p0: number;
    p1: number;
    p2: number;
    fp_suppressed: number;
    tool_failures: number;
  };
}

