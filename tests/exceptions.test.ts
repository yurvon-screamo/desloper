import { describe, expect, test } from "bun:test";
import { triage } from "../src/triage.ts";
import { parseSuppressYaml } from "../src/suppress.ts";
import { loadSuppressRules } from "../src/suppress.ts";
import { join } from "node:path";
import type { Finding } from "../src/scanners/types.ts";

/**
 * Behavioral guard for the shipped exceptions.yaml: the RU dash rules
 * moved from scanner hardcode to config must actually suppress the
 * exact category strings the humanizer-ru scanner emits (`ru:<marker>`).
 * A typo in either side would silently flood P1 with RU dashes.
 */
describe("shipped exceptions.yaml behavioral match", () => {
  test("RU dash markers from humanizer-ru are suppressed", async () => {
    const rules = await loadSuppressRules(
      join(import.meta.dir, "../config/exceptions.yaml"),
      "/nonexistent/.desloper.yaml",
    );
    const mk = (category: string): Finding => ({
      tool: "humanizer-ru", lang: "ru", file: "content/ru/page.md", line: null,
      severity: "marker", category, quote: "—", priority: null,
      fpSuppressed: false, fpReason: null,
    });
    const out = triage([mk("ru:Длинное тире"), mk("ru:Короткое тире"), mk("ru:Кальки")], rules);
    expect(out[0].fpSuppressed).toBe(true);
    expect(out[0].fpReason).toContain("Russian punctuation");
    expect(out[1].fpSuppressed).toBe(true);
    expect(out[2].fpSuppressed).toBe(false); // real finding passes through
  });

  test("en-dash range rule suppresses only when quote carries an en-dash", () => {
    const rules = parseSuppressYaml(`suppress:\n  - category: em-dash\n    quoteContains: "\u2013"\n    reason: range\n`, "t");
    const mk = (quote: string): Finding => ({
      tool: "avoid-ai-writing", lang: "en", file: "a.md", line: null,
      severity: "medium", category: "em-dash", quote, priority: null,
      fpSuppressed: false, fpReason: null,
    });
    expect(triage([mk("N5\u2013N1 range")], rules)[0].fpSuppressed).toBe(true);
    expect(triage([mk("10 em dashes in 100 words")], rules)[0].fpSuppressed).toBe(false);
  });
});
