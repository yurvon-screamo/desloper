import { describe, expect, test } from "bun:test";
import { parseConcatenatedJson } from "../src/normalize.ts";
import { detectLang, isConfident } from "../src/langdetect.ts";
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
  test("by path segment ja (informal jp segment too)", () => {
    expect(detectLang("content/ja/post.md", "")).toBe("ja");
    expect(detectLang("blog/jp/entry.md", "")).toBe("ja");
  });
  test("by path segment es (spa/spanish/espanol aliases)", () => {
    expect(detectLang("content/es/post.md", "")).toBe("es");
    expect(detectLang("blog/spa/entry.md", "")).toBe("es");
    expect(detectLang("spanish/guia.md", "")).toBe("es");
    expect(detectLang("espanol/nota.md", "")).toBe("es");
  });
  test("by content: spanish stopword dominance", () => {
    const es = "El desarrollo de software es una disciplina que combina técnica y creatividad. " +
      "Los equipos que trabajan con metodologías ágiles entregan valor de forma continua, " +
      "porque las iteraciones cortas permiten corregir el rumbo sin perder de vista el objetivo. " +
      "Cuando una organización decide adoptar estas prácticas, lo más importante es la cultura: " +
      "sin ella, las herramientas por sí solas no cambian nada. Este equilibrio entre personas y " +
      "procesos es lo que sostiene los proyectos a lo largo del tiempo, incluso cuando el código " +
      "envejece y las prioridades cambian por completo.\n\n" +
      "La documentación es otra pieza que muchas veces se descuida. Un equipo que escribe lo que " +
      "hace, y por qué lo hace, reduce el coste de incorporar gente nueva porque el conocimiento " +
      "no vive solo en la cabeza de quienes llevan años en el proyecto. Las pruebas automatizadas " +
      "cumplen un papel parecido: dicen qué se esperaba del sistema y cuándo dejó de cumplirse. " +
      "Entre las dos cosas, un equipo gana la capacidad de cambiar con confianza, que es la que " +
      "realmente importa cuando el negocio pide girar.\n\n" +
      "Sobre las herramientas: conviene recordar que ninguna escribe el código por ti. Las que " +
      "mejor funcionan son las que se integran en el flujo que ya existe, porque cada nueva " +
      "pieza que exige rituals propios termina abandonada. Lo que de verdad sostiene un " +
      "sistema a lo largo de los años es la combinación de decisiones pequeñas y consistentes, " +
      "tomadas por gente que entiende el contexto y que se queda a ver el resultado.";
    expect(detectLang("x.md", es)).toBe("es");
  });
  test("by content: strong markers (ñ/¿/¡) fast path", () => {
    expect(detectLang("x.md", "El año que viene, ¿vamos a la montaña? ¡Claro que sí! El señor García dijo que sí, año tras año.")).toBe("es");
  });
  test("EN text quoting spanish words stays en (regression guard)", () => {
    // "del", "real", "arena" are EN words/homographs; ES-exclusive
    // stopwords must not cluster from them. Also many EN function words.
    const en = "The music festival in Del Rio is real. The arena and the stage design " +
      "are the best in the state, and that is not an exaggeration. The band plays " +
      "for two hours and the crowd loves it. We can see the contrast with the shows " +
      "in the city, where the venues are smaller but the energy is the same. " +
      "It is the kind of night that people remember for years to come.";
    expect(detectLang("x.md", en)).toBe("en");
  });
  test("EN blog quoting ñ/¿/¡ stays en (strong-marker dominance guard)", () => {
    const en = "The Spanish alphabet includes the letter enye, written as ñ, which " +
      "originated as a shorthand for the double n in old castilian manuscripts. " +
      "The tilde over the n is the same mark we now see in the notation for " +
      "approximation in mathematics, and it traveled into spanish from medieval " +
      "scribal abbreviations that the monks used for common letter pairs.";
    expect(detectLang("x.md", en)).toBe("en");
  });
  test("portuguese text is NOT es (PT guard)", () => {
    const pt = "O desenvolvimento de software é uma prática que evolui constantemente. " +
      "As equipes que adotam metodologias ágeis conseguem entregar valor às pessoas " +
      "de forma mais rápida, e a organização também ganha. Não é uma solução mágica, " +
      "mas as iterações curtas ajudam a corrigir a direção do projeto. A questão da " +
      "cultura também é importante: sem ela, as ferramentas não mudam a situação.";
    expect(detectLang("x.md", pt)).not.toBe("es");
  });
});

describe("isConfident (es)", () => {
  test("path aliases are always confident", () => {
    for (const p of ["content/es/a.md", "blog/spa/b.md", "spanish/c.md", "espanol/d.md"]) {
      expect(isConfident(p, "")).toBe(true);
    }
  });
  test("spanish 'dos' does not poison the PT guard (dos removed from PT_MARKS)", () => {
    const es = "El informe cubre dos países, dos mercados y dos equipos distintos. " +
      "El resumen analiza que los datos de los dos años confirman que las dos " +
      " hipótesis sobre los dos sectores eran correctas y que las dos previsiones " +
      "sobre los dos ciclos también lo eran, según los dos estudios de los dos " +
      "institutos que llevaron dos años de trabajo sobre las dos líneas de datos. " +
      "Además, los dos informes que acompañan a las dos auditorías señalan que las " +
      "dos evaluaciones de los dos programas coinciden con las dos conclusiones " +
      "que los dos comités presentaron para los dos trimestres. Cuando los dos " +
      "equipos terminaron el análisis de las dos muestras, las dos revisiones " +
      "confirmaron que los dos criterios eran los mismos para las dos series de " +
      "datos que las dos unidades registraron durante los dos años del estudio.";
    expect(detectLang("x.md", es)).toBe("es");
  });
  test("stopword-dense ES content is confident; strong-marker-only is uncertain", () => {
    const dense = "Los equipos que trabajan con metodologías ágiles entregan valor " +
      "porque las iteraciones cortas permiten corregir el rumbo sin perder de vista " +
      "el objetivo, y cuando una organización decide adoptar estas prácticas, lo " +
      "importante es la cultura. Sin ella, las herramientas no cambian nada. Este " +
      "equilibrio entre personas y procesos sostiene los proyectos a lo largo del " +
      "tiempo, incluso cuando el código envejece y las prioridades cambian. La " +
      "documentación es otra pieza que muchas veces se descuenta: un equipo que " +
      "escribe lo que hace reduce el coste de incorporar gente nueva porque el " +
      "conocimiento no vive solo en la cabeza de quienes llevan años en el proyecto. " +
      "Las pruebas automatizadas cumplen un papel parecido, porque dicen qué se " +
      "esperaba del sistema y cuándo dejó de cumplirse. Entre las dos cosas, un " +
      "equipo gana la capacidad de cambiar con confianza, que es la que realmente " +
      "importa cuando el negocio pide girar. Sobre las herramientas conviene " +
      "recordar que ninguna escribe el código por ti, y que las que mejor funcionan " +
      "son las que se integran en el flujo que ya existe, entre otras razones. " +
      "Según el responsable del proyecto, este enfoque también reduce los costes " +
      "porque las decisiones que antes tomaba una sola persona ahora pasan por un " +
      "grupo. Cuando eso ocurre, los errores se detectan antes, y la gente que " +
      "participa entiende para qué sirve cada paso del proceso. Es una diferencia " +
      "que, según los que lo han vivido, cambia por completo la forma de trabajar.";
    expect(detectLang("x.md", dense)).toBe("es");
    expect(isConfident("x.md", dense)).toBe(true);
    // Fast-path detection via ñ/¿/¡ without stopword density stays
    // deliberately unconfident: the report marks it language_uncertain.
    const sparse = "Año tras año, ¿seguimos igual? ¡Claro! El señor García lo dijo mañana.";
    expect(detectLang("x.md", sparse)).toBe("es");
    expect(isConfident("x.md", sparse)).toBe(false);
  });
});

describe("detectLang (script detection, continued)", () => {
  test("by script: japanese kana text", () => {
    expect(detectLang("x.md", "これは日本語のテキストです。ひらがなとカタカナが含まれています。")).toBe("ja");
  });
  test("cyrillic-dominant file with kana quotes stays ru (check ordering)", () => {
    const ru = "Японский язык использует три системы письма: ひらがな、カタカナ、漢字。" +
      "Это русское предложение про изучение языков. Здесь много кириллицы вокруг цитаты. " +
      "И ещё одно русское предложение для доминирования кириллицы в образце.";
    expect(detectLang("x.md", ru)).toBe("ru");
  });
  test("kanji without kana is NOT ja (zh ambiguity) — falls to en", () => {
    expect(detectLang("x.md", "这是一个测试文档。我们在这里讨论技术问题。")).toBe("en");
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
  test("ja:forbidden_phrase is P1", () => {
    const out = triage([{ ...base, category: "ja:forbidden_phrase", quote: "と言えるでしょう" }], []);
    expect(out[0].priority).toBe("P1");
  });
  test("es:pomposity_frame is P1", () => {
    const out = triage([{ ...base, category: "es:pomposity_frame", quote: "Es importante destacar que..." }], []);
    expect(out[0].priority).toBe("P1");
  });
  test("es:triads is P2 despite high severity", () => {
    const out = triage([{ ...base, category: "es:triads", quote: "rápido, fiable y escalable" }], []);
    expect(out[0].priority).toBe("P2");
  });
  test("es:em_dash_inciso is P2", () => {
    const out = triage([{ ...base, category: "es:em_dash_inciso", quote: " — así — " }], []);
    expect(out[0].priority).toBe("P2");
  });
  test("unknown es: category defaults to visible P1", () => {
    const out = triage([{ ...base, category: "es:some_future_detector" }], []);
    expect(out[0].priority).toBe("P1");
  });
  test("ja:low_burstiness is P2 by category despite warn severity", () => {
    const out = triage([{ ...base, category: "ja:low_burstiness", severity: "warn" }], []);
    expect(out[0].priority).toBe("P2");
  });
  test("unknown ja: category defaults to visible P1", () => {
    const out = triage([{ ...base, category: "ja:some_future_detector" }], []);
    expect(out[0].priority).toBe("P1");
  });
  test("ja-lint formatting category is P2", () => {
    const out = triage([{ ...base, tool: "ja-lint", category: "JA-AI-L01", severity: "warn" }], []);
    expect(out[0].priority).toBe("P2");
  });
  test("ja-lint weak intensifier hype is P2", () => {
    const out = triage([{ ...base, tool: "ja-lint", category: "JA-AI-H01", severity: "info" }], []);
    expect(out[0].priority).toBe("P2");
  });
  test("ja-lint strong hype defaults to P1", () => {
    const out = triage([{ ...base, tool: "ja-lint", category: "JA-AI-H03", severity: "high" }], []);
    expect(out[0].priority).toBe("P1");
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
