import { describe, expect, test } from "bun:test";
import { parseSuppressYaml } from "../src/suppress.ts";
import { scanP0 } from "../src/scanners/p0.ts";

describe("parseSuppressYaml", () => {
  test("parses well-formed rules", () => {
    const y = `suppress:
  - file: "**/*.md"
    category: em-dash
    quoteContains: "meta_title"
    reason: "SEO convention"
  - tool: zero-slop
    reason: noise
`;
    const r = parseSuppressYaml(y, "test");
    expect(r.length).toBe(2);
    expect(r[0].file).toBe("**/*.md");
    expect(r[0].quoteContains).toBe("meta_title");
    expect(r[1].reason).toBe("noise");
  });
  test("block without reason is dropped, not crashed", () => {
    const y = `suppress:
  - category: em-dash
`;
    expect(parseSuppressYaml(y, "t").length).toBe(0);
  });
  test("leading indented key (no dash) does not crash", () => {
    const y = `  category: em-dash
  reason: x
`;
    expect(parseSuppressYaml(y, "t").length).toBe(0);
  });
  test("unknown key ignored with warning", () => {
    const y = `suppress:
  - category: em-dash
    bogus: 1
    reason: r
`;
    const r = parseSuppressYaml(y, "t");
    expect(r.length).toBe(1);
    expect("bogus" in (r[0] as unknown as Record<string, unknown>)).toBe(false);
  });
  test("comments and other sections skipped", () => {
    const y = `# top comment
other: value
suppress:
  # inner comment
  - tool: aaw
    reason: r
after: 1
`;
    expect(parseSuppressYaml(y, "t").length).toBe(1);
  });
});

describe("scanP0 (vendor-independent)", () => {
  test("placeholder in otherwise clean file", () => {
    const content = "A perfectly normal sentence.\nAnother one about Japanese.\nSearch \"app in [your language]\".\n";
    const { findings } = scanP0("f.md", content, "en");
    expect(findings.length).toBe(1);
    expect(findings[0].priority).toBe("P0");
    expect(findings[0].line).toBe(3);
  });
  test("clean file has no P0", () => {
    expect(scanP0("f.md", "just text", "en").findings.length).toBe(0);
  });
  test("placeholder inside HTML comment ignored", () => {
    const content = "<!-- disable-file [your thing] -->\ntext\n";
    expect(scanP0("f.md", content, "en").findings.length).toBe(0);
  });
});
