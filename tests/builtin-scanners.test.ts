import { describe, expect, test } from "bun:test";
import { PhraseScanner } from "../src/scanners/phrase.ts";
import { ViBuiltinScanner } from "../src/scanners/vi-builtin.ts";
import { MetricsScanner } from "../src/scanners/metrics-scanner.ts";

const en = "We're thrilled to announce cutting-edge tech. In conclusion, only time will tell.";
const ru = "В современном мире важно отметить, что это открывает новые горизонты. В заключение отметим.";
const ko = "첫째, 결론적으로 이는 시사하는 바가 큽니다.";
const vi = "Trong thời đại số hiện nay, đây là vượt trội và tuyệt vời.";

describe("PhraseScanner", () => {
  test("EN cliche detected", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "en", new Map([["t.md", en]]));
    expect(r.findings.some((f) => (f.quote ?? "").includes("in conclusion"))).toBe(true);
  });
  test("RU cliche detected", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "ru", new Map([["t.md", ru]]));
    expect(r.findings.some((f) => (f.quote ?? "").includes("важно отметить"))).toBe(true);
    expect(r.findings.some((f) => (f.quote ?? "").includes("современном мире"))).toBe(true);
  });
  test("KO short hangul phrases are NOT cut by length floor", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "ko", new Map([["t.md", ko]]));
    expect(r.findings.some((f) => (f.quote ?? "").includes("첫째"))).toBe(true);
    expect(r.findings.some((f) => (f.quote ?? "").includes("결론적으로"))).toBe(true);
  });
  test("VI series cliche detected", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "vi", new Map([["t.md", vi]]));
    expect(r.findings.some((f) => (f.quote ?? "").includes("thời đại số"))).toBe(true);
  });
  test("weak signals need repetition (single occurrence suppressed)", async () => {
    // "является" is a bureaucratic phrase (weak): one occurrence -> no finding
    const r = await new PhraseScanner().scan(["t.md"], "ru", new Map([["t.md", "Это является тестом."]]));
    expect(r.findings.length).toBe(0);
  });
  test("weak signals surface from second occurrence", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "ru", new Map([["t.md", "Это является тестом. Это является проверкой."]]));
    expect(r.findings.some((f) => f.severity === "weak" && (f.quote ?? "").includes("является"))).toBe(true);
  });
  test("counter xN", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "en", new Map([["t.md", "In conclusion A. In conclusion B. In conclusion C."]]));
    expect(r.findings.some((f) => (f.quote ?? "").includes("in conclusion ×3") && f.severity === "high")).toBe(true);
  });
});

describe("ViBuiltinScanner", () => {
  test("VI-HUM-L03 regex phrase detected with line number", async () => {
    const r = await new ViBuiltinScanner().scan(["t.md"], "vi", new Map([["t.md", "text\nvượt trội và tuyệt vời\n"]]));
    expect(r.findings.some((f) => f.category === "VI-HUM-L03" && f.line === 2)).toBe(true);
  });
  test("VI-HUM-S01 (?m) python inline flag converted — 'Việc' at line start", async () => {
    const text = "Việc học tiếng Nhật khó. Đó là Việc khác.\nViệc thứ ba ở dòng mới.\n";
    const r = await new ViBuiltinScanner().scan(["t.md"], "vi", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "VI-HUM-S01")).toBe(true);
  });
  test("VI-HUM-D02 phrases-only pattern matched", async () => {
    const text = "Cảm ơn. Hy vọng bài viết này hữu ích cho bạn.\n";
    const r = await new ViBuiltinScanner().scan(["t.md"], "vi", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "VI-HUM-D02")).toBe(true);
  });
  test("all 10 VI-HUM ids compile (7 regex + phrases coverage)", async () => {
    const s = new ViBuiltinScanner();
    expect(await s.available()).toBe(true);
  });
});

describe("MetricsScanner", () => {
  test("slop fixture scores >= 30", async () => {
    const slop = await Bun.file("tests/fixtures/en/sample-slop.md").text();
    const r = await new MetricsScanner().scan(["t.md"], "en", new Map([["t.md", slop]]));
    expect(r.findings.length).toBeGreaterThanOrEqual(1);
    expect(r.findings[0].category).toBe("humanizer-score");
  });
  test("clean human text stays below 30", async () => {
    const clean = "I fixed the bug yesterday. It was a race condition in the loader. Two lines of code.\n\nMy cat disagrees with the design. She usually does.";
    const r = await new MetricsScanner().scan(["t.md"], "en", new Map([["t.md", clean]]));
    expect(r.findings.length).toBe(0);
  });
});
