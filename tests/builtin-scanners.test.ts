import { describe, expect, test } from "bun:test";
import { PhraseScanner } from "../src/scanners/phrase.ts";
import { ViBuiltinScanner } from "../src/scanners/vi-builtin.ts";
import { JaBuiltinScanner } from "../src/scanners/ja-builtin.ts";
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
  test("JA cliche detected (kana/kanji entries pass the length floor)", async () => {
    const ja = "本記事では、革命的なツールをご紹介します。";
    const r = await new PhraseScanner().scan(["t.md"], "ja", new Map([["t.md", ja]]));
    expect(r.findings.some((f) => (f.quote ?? "").includes("革命的"))).toBe(true);
    expect(r.findings.some((f) => (f.quote ?? "").includes("本記事では"))).toBe(true);
  });
  test("JA weak signals need repetition (single occurrence suppressed)", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "ja", new Map([["t.md", "導入すること可能です。"]]));
    expect(r.findings.length).toBe(0);
  });
  test("JA weak signals surface from second occurrence", async () => {
    const ja = "設定することが可能です。変更することが可能です。";
    const r = await new PhraseScanner().scan(["t.md"], "ja", new Map([["t.md", ja]]));
    expect(r.findings.some((f) => f.severity === "weak" && (f.quote ?? "").includes("することが可能"))).toBe(true);
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
    expect(r.findings.some((f) => (f.quote ?? "").toLowerCase().includes("in conclusion ×3") && f.severity === "high")).toBe(true);
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
  test("multiple occurrences in one line each reported", async () => {
    const text = "vượt trội và vượt trội nữa\n";
    const r = await new ViBuiltinScanner().scan(["t.md"], "vi", new Map([["t.md", text]]));
    const l03 = r.findings.filter((f) => f.category === "VI-HUM-L03" && (f.quote ?? "").includes("vượt"));
    expect(l03.length).toBeGreaterThanOrEqual(2);
  });
  test("catalog compiles: no silent regex drop in VI-HUM", async () => {
    // Compile every VI-HUM regex through the same conversion the scanner
    // uses; a future catalog edit must not silently kill patterns.
    const { compilePyRegex } = await import("../src/scanners/vi-builtin.ts");
    const catalog = JSON.parse(
      await Bun.file("config/dictionaries/vi-patterns.json").text(),
    ) as Record<string, { id: string; signals?: { regex?: string[]; phrases?: string[] } }[]>;
    const hum = Object.values(catalog).flat().filter((p) => p.id.startsWith("VI-HUM"));
    let withSignals = 0;
    for (const p of hum) {
      const regexes = p.signals?.regex ?? [];
      const phrases = p.signals?.phrases ?? [];
      if (regexes.length + phrases.length === 0) continue;
      withSignals++;
      for (const src of regexes) {
        // A silent null from compilePyRegex on a catalog edit is exactly
        // the regression this test exists to catch.
        expect(compilePyRegex(src)).not.toBeNull();
      }
    }
    // The taxon must keep real detectors (not degenerate to phrases-only).
    expect(withSignals).toBeGreaterThanOrEqual(9);
  });
});

describe("JaBuiltinScanner", () => {
  test("JA-AI-L01 emoji in list item detected with line number", async () => {
    const text = "序文です。\n- ✅ 高速な処理を実現します\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "JA-AI-L01" && f.line === 2)).toBe(true);
  });
  test("JA-AI-L02 bold-label list item detected", async () => {
    const text = "- **注意**: これは注意項目です\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "JA-AI-L02")).toBe(true);
  });
  test("JA-AI-E01 emoji+bold combo detected", async () => {
    const text = "✅ **高速** な処理を実現します\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "JA-AI-E01")).toBe(true);
  });
  test("JA-AI-E02 bold info prefix detected", async () => {
    const text = "**重要**： 導入前には見直しが必要です。\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "JA-AI-E02")).toBe(true);
  });
  test("JA-AI-E03 bold inside heading detected", async () => {
    const text = "## **圧倒的な速度**で仕事をする\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "JA-AI-E03" && f.line === 1)).toBe(true);
  });
  test("JA-AI-H02 abstract hype phrase detected", async () => {
    const text = "このツールは業務を民主化するものです。\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.some((f) => f.category === "JA-AI-H02")).toBe(true);
  });
  test("plain JA prose produces no ja-lint findings", async () => {
    const text = "昨日、駅前の新しいパン屋に入ってみた。クロワッサンが売り切れだったので、メロンパンを買った。\n";
    const r = await new JaBuiltinScanner().scan(["t.md"], "ja", new Map([["t.md", text]]));
    expect(r.findings.length).toBe(0);
  });
  test("catalog compiles: no silent regex drop in JA-AI", async () => {
    const { compileRuleRegex } = await import("../src/scanners/ja-builtin.ts");
    const catalog = JSON.parse(
      await Bun.file("config/dictionaries/ja-patterns.json").text(),
    ) as Record<string, { id: string; signals?: { regex?: string[]; phrases?: string[] } }[]>;
    const ja = Object.values(catalog).flat().filter((p) => p.id.startsWith("JA-AI"));
    expect(ja.length).toBeGreaterThan(0);
    for (const p of ja) {
      for (const src of p.signals?.regex ?? []) {
        expect(compileRuleRegex(src)).not.toBeNull();
      }
    }
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
