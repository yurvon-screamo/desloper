import type { Finding, Lang } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { join } from "node:path";

/**
 * Built-in phrase scanner (replaces the texthumanize system CLI):
 * matches AI clichés, bureaucratic phrases and AI connectors from the
 * dictionaries extracted from texthumanize (MIT) — see
 * config/dictionaries/texthumanize-dicts.json — plus the KO/VI
 * cliche lists distilled during the production series.
 * Zero subprocess, zero network, works for all four languages.
 * Cliches are strong signals (P1); bureaucratic phrases and connectors
 * are weak signals (severity "weak" -> P2 by triage) that matter in
 * repetition, so they surface from their second occurrence.
 */

interface LangDicts {
  cliches: string[];
  bureaucratic_phrases: string[];
  ai_connectors: string[];
}

const ROOT = join(import.meta.dir, "../..");

// Series-distilled cliche lists (from the KO/VI deslop rounds) used to
// top up languages texthumanize's cliches did not cover. Hangul entries
// are 2-3 syllable blocks — do NOT apply latin-oriented length floors.
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

// Length floor by script: latin/cyrillic phrases need >=4 chars to be
// meaningful; hangul/vietnamese-with-marks entries are curated lists —
// no floor (2-3 syllable hangul blocks are full words).
function passesLengthFloor(p: string): boolean {
  if (/[\uac00-\ud7af]/.test(p)) return true; // hangul
  if (/[\u1ea0-\u1ef9ăâêôơưđ]/i.test(p)) return true; // vietnamese marks
  return p.length >= 4;
}

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

interface Rule {
  needle: string;
  kind: "cliche" | "weak";
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

  async scan(files: string[], lang: Lang, contents?: Map<string, string>): Promise<ScannerResult> {
    const dicts = (await loadDicts())[lang] ?? { cliches: [], bureaucratic_phrases: [], ai_connectors: [] };
    const rules: Rule[] = [
      ...new Set([...dicts.cliches, ...SERIES_CLICHES[lang]]),
    ]
      .filter(passesLengthFloor)
      .map((needle) => ({ needle, kind: "cliche" as const }));
    for (const needle of new Set([...dicts.bureaucratic_phrases, ...dicts.ai_connectors])) {
      if (passesLengthFloor(needle)) rules.push({ needle, kind: "weak" });
    }

    const findings: Finding[] = [];
    for (const file of files) {
      const content = contents?.get(file) ?? (await Bun.file(file).text());
      const lower = content.toLowerCase();
      const hits = new Map<string, { kind: Rule["kind"]; count: number }>();
      for (const { needle, kind } of rules) {
        const n = needle.toLowerCase();
        let idx = lower.indexOf(n);
        let count = 0;
        while (idx !== -1) {
          count++;
          idx = lower.indexOf(n, idx + n.length);
        }
        if (count > 0) {
          const prev = hits.get(needle);
          // cliche outranks weak: same phrase listed in both dictionaries
          // must keep the strong signal (Map overwrite bug).
          const kindFinal = prev && prev.kind === "cliche" ? "cliche" : kind;
          hits.set(needle, { kind: kindFinal, count: prev ? Math.max(prev.count, count) : count });
        }
      }
      for (const [phrase, { kind, count }] of hits) {
        // Weak signals (bureaucratic/connectors) surface from 2nd occurrence
        if (kind === "weak" && count < 2) continue;
        findings.push({
          tool: this.name,
          lang,
          file,
          line: null,
          severity: count >= 3 ? "high" : kind === "cliche" ? "phrase" : "weak",
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
