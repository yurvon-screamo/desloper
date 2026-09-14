import { describe, expect, test } from "bun:test";
import { parseConcatenatedJson } from "../src/normalize.ts";
import { detectLang } from "../src/langdetect.ts";
import { triage } from "../src/triage.ts";
import type { Finding } from "../src/scanners/types.ts";

describe("parseConcatenatedJson", () => {
  test("single doc", () => {
    expect(parseConcatenatedJson('{"a":1}')).toEqual([{ a: 1 }]);
  });
  test("two docs concatenated (batch pitfall)", () => {
    const raw = '{"a":1}\n{"b":[1,2]}\n';
    expect(parseConcatenatedJson(raw)).toEqual([{ a: 1 }, { b: [1, 2] }]);
  });
  test("nested braces inside strings do not break splitting", () => {
    const raw = '{"q":"a } b { c"}{"x":2}';
    expect(parseConcatenatedJson(raw)).toEqual([{ q: "a } b { c" }, { x: 2 }]);
  });
  test("top-level array is flattened", () => {
    expect(parseConcatenatedJson('[{"f":1},{"f":2}]')).toEqual([{ f: 1 }, { f: 2 }]);
  });
  test("throws on unbalanced", () => {
    expect(() => parseConcatenatedJson('{"a":1')).toThrow();
  });
});

describe("detectLang", () => {
  test("by path segment ru", () => {
    expect(detectLang("content/blog/ru/post.md", "")).toBe("ru");
  });
  test("by path segment ko", () => {
    expect(detectLang("/srv/site/ko_README.md", "")).toBe("ko");
  });
  test("by path segment vi", () => {
    expect(detectLang("vi/index.md", "")).toBe("vi");
  });
  test("by script: korean text", () => {
    expect(detectLang("x.md", "한국어 텍스트입니다. 안녕하세요 세계입니다. 한글이 많습니다.")).toBe("ko");
  });
  test("by script: russian text", () => {
    expect(detectLang("x.md", "Это русский текст про изучение японского языка. Здесь много кириллицы.")).toBe("ru");
  });
  test("by diacritics: vietnamese", () => {
    expect(detectLang("x.md", "Đây là văn bản tiếng Việt với nhiều dấu: ườ ẫ ộ đ ư ơ")).toBe("vi");
  });
  test("latin default en", () => {
    expect(detectLang("x.md", "Plain english text about learning japanese")).toBe("en");
  });
});

describe("triage", () => {
  const base: Finding = {
    tool: "t", lang: "en", file: "a.md", line: 1, severity: "high",
    category: "em-dash", quote: "10 em dashes in 100 words", priority: null,
    fpSuppressed: false, fpReason: null,
  };
  test("placeholder is P0", () => {
    const out = triage([{ ...base, quote: 'Search "learn japanese in [your language]" runs' }], []);
    expect(out[0].priority).toBe("P0");
  });
  test("known category maps to P1", () => {
    expect(triage([base], [])[0].priority).toBe("P1");
  });
  test("structural category maps to P2", () => {
    expect(triage([{ ...base, category: "rhythm" }], [])[0].priority).toBe("P2");
  });
  test("suppression downgrades with reason", () => {
    const rules = [{ file: "**/*.md", reason: "test suppression" }];
    const out = triage([base], rules);
    expect(out[0].fpSuppressed).toBe(true);
    expect(out[0].fpReason).toBe("test suppression");
  });
  test("non-matching rule does not suppress", () => {
    const rules = [{ file: "**/other.md", reason: "nope" }];
    expect(triage([base], rules)[0].fpSuppressed).toBe(false);
  });
  test("glob ** matches nested paths", () => {
    const rules = [{ file: "**/*.md", reason: "all md" }];
    expect(triage([{ ...base, file: "deep/nest/x.md" }], rules)[0].fpSuppressed).toBe(true);
  });
});
