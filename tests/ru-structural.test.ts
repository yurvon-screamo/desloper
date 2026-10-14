import { describe, expect, test } from "bun:test";
import { RuStructuralScanner, isSentenceBoundary } from "../src/scanners/ru-structural.ts";
import { triage } from "../src/triage.ts";
import type { Finding } from "../src/scanners/types.ts";

const BODY_111 = "Взял решение PublicSite из догфуда — одна ENTITY Registrations в доменном CONTEXT — и сделал два варианта fern.";
const LONG_BODY = "Дальше идёт длинный осмысленный абзац про доменную модель, зеркала инстансов и рассинхрон между сервисами, который мы чинили всю прошлую неделю и который так и не воспроизвёлся локально ни разу.";

async function scan(text: string): Promise<Finding[]> {
  const r = await new RuStructuralScanner().scan(["t.md"], "ru", new Map([["t.md", text]]));
  return r.findings;
}

describe("RuStructuralScanner: fragment-lead", () => {
  test("stub sentence before 100+ char body (issue ground truth)", async () => {
    const findings = await scan(`Что делал. ${BODY_111}`);
    const lead = findings.find((f) => f.category === "ru:fragment-lead");
    expect(lead).toBeDefined();
    expect(lead?.line).toBe(1);
    expect(lead?.quote).toBe("Что делал.");
  });

  test("standalone stub paragraph leading into a long one (issue opener)", async () => {
    const findings = await scan(`Разобрался, что тут происходит.\n\n${LONG_BODY}`);
    const lead = findings.find((f) => f.category === "ru:fragment-lead");
    expect(lead).toBeDefined();
    expect(lead?.quote).toBe("Разобрался, что тут происходит.");
  });

  test("one-word run-in label stays clean (human-fixed issue version)", async () => {
    const findings = await scan("Методика. Взял решение PublicSite из догфуда, в нём одна ENTITY Registrations в доменном CONTEXT. Собрал два варианта fern.");
    expect(findings.find((f) => f.category === "ru:fragment-lead")).toBeUndefined();
  });

  test("short closing paragraph stays clean (no substantial body after)", async () => {
    const findings = await scan(`${LONG_BODY}\n\nИтог: работает.`);
    expect(findings.find((f) => f.category === "ru:fragment-lead")).toBeUndefined();
  });

  test("initials and abbreviations do not cut a fake stub", async () => {
    const findings = await scan(
      "И. И. Иванов пришел в проект, поднял окружение, переписал миграции и задеплоил всё это на прод в тот же вечер.",
    );
    expect(findings.find((f) => f.category === "ru:fragment-lead")).toBeUndefined();
  });

  test("decimal numbers do not cut a fake stub", async () => {
    const findings = await scan(
      "В версии 2.5 переписали загрузчик конфигов, который тянет переменные из окружения и падает на пустых значениях при старте.",
    );
    expect(findings.find((f) => f.category === "ru:fragment-lead")).toBeUndefined();
  });

  test("multi-letter abbreviations do not end sentences (direct boundary probe)", () => {
    // Verdict-level tests cannot pin this branch: stub cutting skips
    // invalid boundaries, so only the boundary position differs.
    const seeAlso = "Подробнее см. ниже.";
    expect(isSentenceBoundary(seeAlso, seeAlso.indexOf("см.") + 2)).toBe(false);
    const etc = "Работает т. е. ок.";
    expect(isSentenceBoundary(etc, etc.indexOf("т.") + 1)).toBe(false);
    const thousands = "Объём тыс. строк кода. Дальше разбор.";
    expect(isSentenceBoundary(thousands, thousands.indexOf("тыс.") + 3)).toBe(false);
    // The reference-boundary check: the real sentence end is a boundary.
    expect(isSentenceBoundary(thousands, thousands.indexOf("кода.") + 4)).toBe(true);
  });

  test("multi-letter abbreviation keeps the stub whole (behavioral)", async () => {
    const findings = await scan(`Объём тыс. строк кода. ${LONG_BODY}`);
    const lead = findings.find((f) => f.category === "ru:fragment-lead");
    expect(lead?.quote).toBe("Объём тыс. строк кода.");
  });

  test("indented code blocks are not prose (arrows and dashes inside stay clean)", async () => {
    const findings = await scan(
      `Текст до кода.\n\n    план → аппрув → внесение\n    a — b — c — d\n\n${LONG_BODY}`,
    );
    // The indented block is excluded AND breaks lead adjacency:
    // "Текст до кода." introduces its own code sample, not a body.
    expect(findings.length).toBe(0);
  });

  test("thematic breaks split paragraphs and cut lead adjacency", async () => {
    const findings = await scan(`Разобрался, что тут происходит.\n\n---\n\nЧто делал. ${BODY_111}`);
    const leads = findings.filter((f) => f.category === "ru:fragment-lead");
    // Sections separated by a rule are independent: only the intra-
    // paragraph stub ("Что делал.") flags.
    expect(leads.length).toBe(1);
    expect(leads[0].line).toBe(5);
  });

  test("dash-drawn thematic break splits paragraphs too", async () => {
    const findings = await scan(`Разобрался, что тут происходит.\n\n— — —\n\nЧто делал. ${BODY_111}`);
    const leads = findings.filter((f) => f.category === "ru:fragment-lead");
    expect(leads.length).toBe(1);
    expect(leads[0].line).toBe(5);
  });

  test("setext underline splits paragraphs", async () => {
    const findings = await scan(`Заголовок раздела\n===\n\nЧто делал. ${BODY_111}`);
    const leads = findings.filter((f) => f.category === "ru:fragment-lead");
    expect(leads.length).toBe(1);
    expect(leads[0].line).toBe(4);
  });

  test("reference stub 'См. …' flags (documented FP class for tech docs)", async () => {
    const findings = await scan(`См. следующий раздел. ${LONG_BODY}`);
    expect(findings.some((f) => f.category === "ru:fragment-lead")).toBe(true);
  });
});

describe("RuStructuralScanner: dash-density", () => {
  const SIX_DASHES =
    "Экземпляр-зеркало — копия без собственной логики. Дубль же — не доменное понятие, а ошибочное состояние. " +
    "Непонятно, где они должны срабатывать — вдруг смотрю не в тот конец. Итог — рассинхрон. Модель — просто болванка. Правка — всегда в первоисточник.";

  test("6 dashes per paragraph flagged high (issue ground truth)", async () => {
    const findings = await scan(SIX_DASHES);
    const dash = findings.find((f) => f.category === "ru:dash-density");
    expect(dash).toBeDefined();
    expect(dash?.severity).toBe("high");
    // Content quote: count + excerpt keep quoteContains suppression usable.
    expect(dash?.quote).toContain("×6");
    expect(dash?.quote).toContain("Экземпляр-зеркало");
  });

  test("3 dashes flagged medium", async () => {
    const findings = await scan("Первый пример — простой. Второй — сложный. Третий — промежуточный вариант.");
    const dash = findings.find((f) => f.category === "ru:dash-density");
    expect(dash).toBeDefined();
    expect(dash?.severity).toBe("medium");
  });

  test("paired construction (2 dashes) stays clean", async () => {
    const findings = await scan(`Взял решение из догфуда — одна ENTITY в доменном CONTEXT — и собрал два варианта.`);
    expect(findings.find((f) => f.category === "ru:dash-density")).toBeUndefined();
  });

  test("dash bullets of a list are not counted", async () => {
    const findings = await scan("План работ на неделю:\n\n— собрать стенд\n— прогнать тесты\n— выкатить релиз\n\n" + LONG_BODY);
    expect(findings.find((f) => f.category === "ru:dash-density")).toBeUndefined();
  });
});

describe("RuStructuralScanner: arrow-prose", () => {
  test("arrow in prose flagged with line number (issue ground truth)", async () => {
    const findings = await scan(`Первая строка без проблем.\n\nСвязь «зеркало → определение» держится по имени.`);
    const arrow = findings.find((f) => f.category === "ru:arrow-prose");
    expect(arrow).toBeDefined();
    expect(arrow?.line).toBe(3);
  });

  test("two arrows on a line: one finding, ×2, high severity", async () => {
    const findings = await scan("План → аппрув → внесение.");
    const arrows = findings.filter((f) => f.category === "ru:arrow-prose");
    expect(arrows.length).toBe(1);
    expect(arrows[0].quote).toContain("×2");
    expect(arrows[0].severity).toBe("high");
  });

  test("digit-flanked progression stays clean (global FP N5 → N1)", async () => {
    const findings = await scan("Путь ученика: N5 → N1 занимает годы. Обычно с 30 → 50 слов в день.");
    expect(findings.find((f) => f.category === "ru:arrow-prose")).toBeUndefined();
  });

  test("exemption is per-arrow: mixed line yields exactly one finding", async () => {
    const findings = await scan("N5 → N1 путь: анализ → синтез.");
    const arrows = findings.filter((f) => f.category === "ru:arrow-prose");
    expect(arrows.length).toBe(1);
    expect(arrows[0].quote).toContain("анализ");
  });

  test("verbal step chains are still flagged (token without digit breaks exemption)", async () => {
    const findings = await scan("Шаг 1 → Шаг 2 завершает настройку.");
    expect(findings.some((f) => f.category === "ru:arrow-prose")).toBe(true);
  });

  test("arrow inside code fence stays clean", async () => {
    const findings = await scan("Текст до кода.\n\n```\nплан → аппрув → внесение\n```\n\n" + LONG_BODY);
    expect(findings.find((f) => f.category === "ru:arrow-prose")).toBeUndefined();
  });

  test("arrow inside a table row stays clean", async () => {
    const findings = await scan("| было | стало |\n| план → аппрув | аппрув |\n");
    expect(findings.find((f) => f.category === "ru:arrow-prose")).toBeUndefined();
  });
});

describe("RuStructuralScanner: issue regression", () => {
  test("full issue repro text fires all three detectors", async () => {
    const repro = [
      "Разобрался, что тут происходит.",
      "",
      "Что делал. " + BODY_111,
      "",
      "Экземпляр-зеркало — копия без собственной логики. Дубль же — не доменное понятие, а ошибочное состояние. " +
        "Непонятно, где они должны срабатывать — вдруг смотрю не в тот конец. Итог — рассинхрон. Модель — просто болванка. Правка — всегда в первоисточник.",
      "",
      "Связь «зеркало → определение» держится по имени. План → аппрув → внесение.",
    ].join("\n");
    const findings = await scan(repro);
    const categories = new Set(findings.map((f) => f.category));
    expect(categories.has("ru:fragment-lead")).toBe(true);
    expect(categories.has("ru:dash-density")).toBe(true);
    expect(categories.has("ru:arrow-prose")).toBe(true);
  });

  test("clean human RU text stays at zero findings", async () => {
    const clean = [
      "Методика. Взял решение PublicSite из догфуда, в нём одна ENTITY Registrations в доменном CONTEXT. Собрал два варианта fern.",
      "",
      "Первый вариант держит состояние в базе, второй читает поток событий. Разница видна на отказах: поток переживает падение инстанса без потерь.",
      "",
      "Итог: работает.",
    ].join("\n");
    const findings = await scan(clean);
    expect(findings.length).toBe(0);
  });
});

describe("triage routing for ru-structural categories", () => {
  const base = {
    tool: "ru-structural", lang: "ru" as const, file: "a.md", line: 1,
    severity: "medium", quote: "q", priority: null, fpSuppressed: false, fpReason: null,
  };
  const routed = (category: string) => triage([{ ...base, category }], [])[0].priority;

  test("ru:fragment-lead -> P1", () => {
    expect(routed("ru:fragment-lead")).toBe("P1");
  });
  test("ru:arrow-prose -> P1", () => {
    expect(routed("ru:arrow-prose")).toBe("P1");
  });
  test("ru:dash-density -> P2 despite live ru: prefix", () => {
    expect(routed("ru:dash-density")).toBe("P2");
  });
  test("existing vendor ru: categories keep the P1 prefix route", () => {
    expect(routed("ru:Длинное тире")).toBe("P1");
  });
  test("existing P2 categories keep exact routing", () => {
    expect(routed("rhythm")).toBe("P2");
    expect(routed("linkedin")).toBe("P2");
  });
});
