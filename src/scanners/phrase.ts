import type { Finding, Lang } from "./types.ts";
import { failedRun, type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";

/**
 * Built-in phrase scanner (replaces the texthumanize system CLI):
 * matches AI clichés / bureaucratic phrases / connectors from the
 * dictionaries extracted from texthumanize (MIT) — see
 * config/dictionaries/texthumanize-dicts.json — plus the KO/VI
 * cliche lists distilled during the production series.
 * Zero subprocess, zero network, works for all four languages.
 */

interface LangDicts {
  cliches: string[];
  bureaucratic_phrases: string[];
  ai_connectors: string[];
}

const ROOT = join(import.meta.dir, "../..");

// Series-distilled cliche lists (from the KO/VI deslop rounds) used to
// top up languages texthumanize's cliches did not cover.
const SERIES_CLICHES: Record<Lang, string[]> = {
  en: [],
  ru: [],
  ko: [
    "결론적으로", "시사하는 바가", "주목할 만하", "주목할 점은", "혁신적",
    "획기적", "압도적", "전례 없", "정리하자면", "되어진다", "에 의해",
    "에 있어서", "첫째", "둘째", "셋째", "필요한 것은", "중요한 것은",
  ],
  vi: [
    "trong thời đại số", "trong bối cảnh", "đóng vai trò then chốt",
    "không chỉ", "tóm lại", "kết luận là", "hơn nữa", "thêm vào đó",
    "bên cạnh đó", "đột phá", "vượt trội", "tuyệt vời", "khai mở tiềm năng",
  ],
};

let cache: Record<string, LangDicts> | null = null;
async function loadDicts(): Promise<Record<string, LangDicts>> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(join(ROOT, "config/dictionaries/texthumanize-dicts.json")).text(),
  ) as { cliches_by_lang?: Record<string, Record<string, unknown>> };
  const out: Record<string, LangDicts> = {};
  for (const [lang, d] of Object.entries(raw.cliches_by_lang ?? {})) {
    out[lang] = {
      cliches: Object.keys(d.cliches ?? {}),
      bureaucratic_phrases: (d.bureaucratic_phrases ?? []) as string[],
      ai_connectors: (d.ai_connectors ?? []) as string[],
    };
  }
  cache = out;
  return out;
}

export class PhraseScanner implements Scanner {
  readonly name = "phrases";
  readonly langs: Lang[] = ["en", "ru", "ko", "vi"];

  async available(): Promise<boolean> {
    try {
      await loadDicts();
      return true;
    } catch {
      return false;
    }
  }

  async scan(files: string[], lang: Lang): Promise<ScannerResult> {
    const dicts = (await loadDicts())[lang] ?? { cliches: [], bureaucratic_phrases: [], ai_connectors: [] };
    const phrases = [
      ...new Set([
        ...dicts.cliches,
        ...SERIES_CLICHES[lang],
      ]),
    ].filter((p) => p.length >= 4);
    const findings: Finding[] = [];
    for (const file of files) {
      const content = await Bun.file(file).text();
      const lower = content.toLowerCase();
      const hits = new Map<string, number>();
      for (const p of phrases) {
        const needle = p.toLowerCase();
        let idx = lower.indexOf(needle);
        while (idx !== -1) {
          hits.set(p, (hits.get(p) ?? 0) + 1);
          idx = lower.indexOf(needle, idx + needle.length);
        }
      }
      for (const [phrase, count] of hits) {
        findings.push({
          tool: this.name,
          lang,
          file,
          line: null,
          severity: count >= 3 ? "high" : "phrase",
          category: "ai-phrase",
          quote: `${phrase}${count > 1 ? ` ×${count}` : ""}`,
          priority: null,
          fpSuppressed: false,
          fpReason: null,
        });
      }
    }
    return {
      run: { tool: this.name, ok: true, files: files.length, findings: findings.length, error: null },
      findings,
    };
  }
}
