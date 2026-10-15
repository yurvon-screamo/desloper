import { describe, expect, test } from "bun:test";
import { PhraseScanner } from "../src/scanners/phrase.ts";
import { ViBuiltinScanner, compilePyRegex } from "../src/scanners/vi-builtin.ts";
import { JaBuiltinScanner } from "../src/scanners/ja-builtin.ts";
import { EsBuiltinScanner } from "../src/scanners/es-builtin.ts";
import { MetricsScanner } from "../src/scanners/metrics-scanner.ts";
import { type ConfigAsset, configPath } from "../src/paths.ts";

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
    const r = await new PhraseScanner().scan(["t.md"], "ja", new Map([["t.md", "導入することが可能です。"]]));
    expect(r.findings.length).toBe(0);
  });
  test("JA weak signals surface from second occurrence", async () => {
    const ja = "設定することが可能です。変更することが可能です。";
    const r = await new PhraseScanner().scan(["t.md"], "ja", new Map([["t.md", ja]]));
    expect(r.findings.some((f) => f.severity === "weak" && (f.quote ?? "").includes("することが可能"))).toBe(true);
  });
  test("ES cliche (EN-tic calque) detected", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "es", new Map([["t.md", "La IA juega un papel crucial hoy."]]));
    expect(r.findings.some((f) => f.severity === "phrase" && (f.quote ?? "").includes("juega un papel crucial"))).toBe(true);
  });
  test("ES weak signals need repetition (single occurrence suppressed)", async () => {
    // "facilitar" is Tier-2 vocabulary (weak): one legitimate use -> silent
    const r = await new PhraseScanner().scan(["t.md"], "es", new Map([["t.md", "Sirve para facilitar el trabajo diario."]]));
    expect(r.findings.length).toBe(0);
  });
  test("ES weak signals surface from second occurrence", async () => {
    const r = await new PhraseScanner().scan(["t.md"], "es", new Map([["t.md", "Sirve para facilitar el trabajo. También sirve para facilitar la vida."]]));
    expect(r.findings.some((f) => f.severity === "weak" && (f.quote ?? "").includes("facilitar"))).toBe(true);
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
  test("ja golden fixture meets vendor statistical thresholds (chars, not bytes)", async () => {
    // The vendor's corpus-calibrated detectors are gated on document
    // length (nominal_ending ≥1500 essay chars, TTR/MTLD ≥4000). A short
    // fixture would hold the CI contract by lexicon only — the rhythm
    // line would regress to zero findings without failing CI.
    const text = await Bun.file("tests/fixtures/ja/sample-slop.md").text();
    expect(text.length).toBeGreaterThanOrEqual(2500);
  });
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

describe("EsBuiltinScanner", () => {
  async function scan(text: string) {
    return new EsBuiltinScanner().scan(["t.md"], "es", new Map([["t.md", text]]));
  }
  test("es golden fixture triggers every es-lint detector family", async () => {
    const text = await Bun.file("tests/fixtures/es/sample-slop.md").text();
    const r = await scan(text);
    const cats = new Set(r.findings.map((f) => f.category));
    for (const cat of [
      "es:pomposity_frame", "es:conclusion_announcer", "es:paragraph_connector",
      "es:triads", "es:mente_adverb_chain", "es:poder_infinitivo", "es:em_dash_inciso",
    ]) {
      expect(cats.has(cat)).toBe(true);
    }
  });
  test("pomposity frame detected case-insensitively with line number", async () => {
    const r = await scan("Un punto de partida. Es importante destacar que esto funciona.\n");
    expect(r.findings.some((f) => f.category === "es:pomposity_frame" && f.line === 1)).toBe(true);
  });
  test("conclusion announcer fires at line start and sentence start", async () => {
    const text = "En resumen, todo cuadra.\nEl plan cambió. En conclusión, sigue igual.\n";
    const r = await scan(text);
    const announcers = r.findings.filter((f) => f.category === "es:conclusion_announcer");
    expect(announcers.length).toBe(2);
    expect(announcers.map((f) => f.line).sort()).toEqual([1, 2]);
  });
  test("paragraph-start announcer after a previous sentence fires exactly ONCE, on its own line", async () => {
    // Regression: the sentence-start rule's \s+ used to swallow newlines,
    // duplicating the ^-rule hit and attributing it to the earlier line.
    const text = "Terminó la reunión anual.\n\nEn resumen, todo cuadra bien.\n";
    const r = await scan(text);
    const announcers = r.findings.filter((f) => f.category === "es:conclusion_announcer");
    expect(announcers.length).toBe(1);
    expect(announcers[0].line).toBe(3);
  });
  test("conclusion announcer does NOT fire mid-phrase without punctuation", async () => {
    const r = await scan("Al final dijeron que en resumen todo cuadra igual.\n");
    expect(r.findings.some((f) => f.category === "es:conclusion_announcer")).toBe(false);
  });
  test("paragraph connector fires at line start with comma, not mid-line", async () => {
    const text = "Además, esto es nuevo.\nY además, esto no es inicio de párrafo.\n";
    const r = await scan(text);
    const conn = r.findings.filter((f) => f.category === "es:paragraph_connector");
    expect(conn.length).toBe(1);
    expect(conn[0].line).toBe(1);
  });
  test("triads fire from third occurrence, single pair stays clean", async () => {
    const one = "El viaje cubría Madrid, Barcelona y Valencia sin paradas.\n";
    const three = one + one.replace("Madrid", "Toledo") + one.replace("Madrid", "Girona");
    expect((await scan(one)).findings.some((f) => f.category === "es:triads")).toBe(false);
    expect((await scan(three)).findings.some((f) => f.category === "es:triads")).toBe(true);
  });
  test("mente chain needs two adverbs in one sentence", async () => {
    const r = await scan("El mercado evoluciona rápidamente y, frecuentemente, se transforma.\n");
    expect(r.findings.some((f) => f.category === "es:mente_adverb_chain")).toBe(true);
    const single = await scan("Naturalmente, el mercado evoluciona sin prisa.\n");
    expect(single.findings.some((f) => f.category === "es:mente_adverb_chain")).toBe(false);
  });
  test("poder+infinitivo fires from third occurrence", async () => {
    const text = "Esto puede ayudar. Aquellos pueden mejorar. Todo podría ser distinto.\n";
    const r = await scan(text);
    expect(r.findings.some((f) => f.category === "es:poder_infinitivo")).toBe(true);
  });
  test("future-tense poder forms count toward poder+infinitivo", async () => {
    const text = "Podremos ayudar en ese caso. También podremos mejorar el proceso. Y podremos avanzar después.\n";
    const r = await scan(text);
    expect(r.findings.some((f) => f.category === "es:poder_infinitivo")).toBe(true);
  });
  test("announcer after list marker or indentation is caught", async () => {
    const text = "- En resumen, todo cuadra.\n  En conclusión, sigue igual.\n3. En definitiva, acaba igual.\n";
    const r = await scan(text);
    const announcers = r.findings.filter((f) => f.category === "es:conclusion_announcer");
    // "3. En definitiva" is caught once, by the sentence-start rule (the
    // numbered marker would double-report with the ^ rule).
    expect(announcers.map((f) => f.line).sort()).toEqual([1, 2, 3]);
  });
  test("spaced em-dash inciso fires; attached dialogue raya does not", async () => {
    const inciso = await scan("El plan — según dijeron — ya está en marcha.\n");
    expect(inciso.findings.some((f) => f.category === "es:em_dash_inciso")).toBe(true);
    const dialogue = await scan("—Hola, dijo el director al entrar en la sala de juntas.\n");
    expect(dialogue.findings.some((f) => f.category === "es:em_dash_inciso")).toBe(false);
  });
  test("two unrelated consequence dashes on one line stay clean", async () => {
    const r = await scan("Ganamos — porque el equipo trabajó. Perdimos — porque el mercado cayó.\n");
    expect(r.findings.some((f) => f.category === "es:em_dash_inciso")).toBe(false);
  });
  test("code fences are skipped by hand-coded detectors", async () => {
    const text = "Ejemplo:\n```\na, b y c\nd, e y f\ng, h y i\n```\n";
    const r = await scan(text);
    expect(r.findings.some((f) => f.category === "es:triads")).toBe(false);
  });
  test("plain human Spanish prose produces no es-lint findings", async () => {
    const text = "Ayer fuimos al mercado de la plaza. Compramos tomates, pan y queso para la cena. " +
      "La vendedora nos contó que su hijo estudia en Valencia.\n";
    const r = await scan(text);
    expect(r.findings.length).toBe(0);
  });
  test("catalog compiles: no silent regex drop in es-patterns", async () => {
    const raw = JSON.parse(
      await Bun.file("config/dictionaries/es-patterns.json").text(),
    ) as { patterns: { name: string; rx: string }[] };
    expect(raw.patterns.length).toBeGreaterThan(0);
    for (const p of raw.patterns) {
      expect(compilePyRegex(p.rx)).not.toBeNull();
    }
  });
});

describe("CatalogScanner (th/my/id)", () => {
  const configs = [
    { name: "th-lint", lang: "th" as const, asset: "dictionaries/th-patterns.json" as ConfigAsset, fixture: "tests/fixtures/th/sample-slop.md" },
    { name: "my-lint", lang: "my" as const, asset: "dictionaries/my-patterns.json" as ConfigAsset, fixture: "tests/fixtures/my/sample-slop.md" },
    { name: "id-lint", lang: "id" as const, asset: "dictionaries/id-patterns.json" as ConfigAsset, fixture: "tests/fixtures/ind/sample-slop.md" },
  ];

  test("every rule of every catalog compiles AND matches its fixture (rule-level coverage)", async () => {
    const { CatalogScanner } = await import("../src/scanners/catalog.ts");
    for (const cfg of configs) {
      const raw = JSON.parse(await Bun.file(configPath(cfg.asset)).text()) as {
        patterns: { name: string; cat: string; rx: string }[];
      };
      expect(raw.patterns.length).toBeGreaterThan(0);
      const fixture = await Bun.file(cfg.fixture).text();
      // Rule-level, not category-level: rules may share a category
      // (id conclusion_announcer ^ vs _mid), so a semantically dead rule
      // must fail HERE, not hide behind a sibling of the same cat.
      for (const p of raw.patterns) {
        const re = compilePyRegex(p.rx);
        expect(re).not.toBeNull();
        expect([...fixture.matchAll(re as RegExp)].length).toBeGreaterThan(0);
      }
      const scanner = new CatalogScanner({ name: cfg.name, langs: [cfg.lang], asset: cfg.asset });
      const r = await scanner.scan(["t.md"], cfg.lang, new Map([["t.md", fixture]]));
      expect(r.findings.length).toBeGreaterThan(0);
    }
  });

  test("th-lint: pomposity detected with line number; connector at line start only", async () => {
    const { CatalogScanner } = await import("../src/scanners/catalog.ts");
    const s = new CatalogScanner({ name: "th-lint", langs: ["th"], asset: "dictionaries/th-patterns.json" });
    const text = "ประโยคแรก\nเป็นที่ทราบกันดีว่าเทคโนโลยีเปลี่ยนโลก\nประโยคที่มี นอกจากนี้ อยู่กลางบรรทัด\nนอกจากนี้ยังมีเรื่องอื่นอีก\n";
    const r = await s.scan(["t.md"], "th", new Map([["t.md", text]]));
    const pomp = r.findings.filter((f) => f.category === "th:pomposity_frame");
    expect(pomp.length).toBe(1);
    expect(pomp[0].line).toBe(2);
    const conn = r.findings.filter((f) => f.category === "th:paragraph_connector");
    expect(conn.length).toBe(1); // line-start only; unspaced gluing still matches
    expect(conn[0].line).toBe(4);
  });

  test("id-lint: mid-sentence announcer after a period fires on the announcer's line exactly once", async () => {
    const { CatalogScanner } = await import("../src/scanners/catalog.ts");
    const idS = new CatalogScanner({ name: "id-lint", langs: ["id"], asset: "dictionaries/id-patterns.json" });
    // Same-line sentence boundary: exercises the _mid rule specifically
    // (the ^ rule cannot match — the announcer is not at line start).
    const text = "Semua langkah selesai. Kesimpulannya, hasilnya memuaskan.\n";
    const r = await idS.scan(["t.md"], "id", new Map([["t.md", text]]));
    const ann = r.findings.filter((f) => f.category === "id:conclusion_announcer");
    expect(ann.length).toBe(1);
    expect(ann[0].line).toBe(1);
  });

  test("plain human prose produces no findings in each catalog language", async () => {
    const { CatalogScanner } = await import("../src/scanners/catalog.ts");
    const cases = [
      { cfg: configs[0], text: "เมื่อวานฉันไปตลาดสดใกล้บ้านแล้วซื้อผลไม้มาไม่กี่ชิ้น รสชาติหวานดี" },
      { cfg: configs[1], text: "မနေ့က အိမ်နဲ့နီးတဲ့ စျေးသို့သွားပြီး သစ်သီးဝလံအနည်းငယ် ဝယ်ခဲ့သည်" },
      { cfg: configs[2], text: "Kemarin saya pergi ke pasar dekat rumah dan membeli buah. Rasanya manis sekali." },
    ];
    for (const { cfg, text } of cases) {
      const s = new CatalogScanner({ name: cfg.name, langs: [cfg.lang], asset: cfg.asset });
      const r = await s.scan(["t.md"], cfg.lang, new Map([["t.md", text]]));
      expect(r.findings.length).toBe(0);
    }
  });

  test("phrases: TH cliche and weak repetition, ID cliche and weak repetition", async () => {
    const th = await new PhraseScanner().scan(["t.md"], "th", new Map([["t.md", "เทคโนโลยีนี้เปลี่ยนโลกไปแล้ว"]]));
    expect(th.findings.some((f) => (f.quote ?? "").includes("เปลี่ยนโลก"))).toBe(true);
    const thWeakOnce = await new PhraseScanner().scan(["t.md"], "th", new Map([["t.md", "โครงการนี้ช่วยยกระดับทีม"]]));
    expect(thWeakOnce.findings.length).toBe(0);
    const thWeakTwice = await new PhraseScanner().scan(["t.md"], "th", new Map([["t.md", "ช่วยยกระดับทีม และยกระดับองค์กร"]]));
    expect(thWeakTwice.findings.some((f) => f.severity === "weak" && (f.quote ?? "").includes("ยกระดับ"))).toBe(true);
    const id = await new PhraseScanner().scan(["t.md"], "id", new Map([["t.md", "Produk ini memainkan peran penting bagi tim kecil."]]));
    expect(id.findings.some((f) => (f.quote ?? "").includes("memainkan peran penting"))).toBe(true);
    const idWeakTwice = await new PhraseScanner().scan(["t.md"], "id", new Map([["t.md", "Kami memfasilitasi diskusi. Kami juga memfasilitasi evaluasi."]]));
    expect(idWeakTwice.findings.some((f) => f.severity === "weak" && (f.quote ?? "").includes("memfasilitasi"))).toBe(true);
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
