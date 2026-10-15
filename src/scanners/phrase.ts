import type { Finding, Lang } from "./types.ts";
import { LANGS } from "./types.ts";
import { type Scanner, type ScannerResult } from "./base.ts";
import { configPath } from "../paths.ts";

/**
 * Built-in phrase scanner (replaces the texthumanize system CLI):
 * matches AI clichés, bureaucratic phrases and AI connectors from the
 * dictionaries extracted from texthumanize (MIT) — see
 * config/dictionaries/texthumanize-dicts.json — plus the KO/VI
 * cliche lists distilled during the production series.
 * Zero subprocess, zero network, works for all nine languages.
 * Cliches are strong signals (P1); bureaucratic phrases and connectors
 * are weak signals (severity "weak" -> P2 by triage) that matter in
 * repetition, so they surface from their second occurrence.
 */

interface LangDicts {
  cliches: string[];
  bureaucratic_phrases: string[];
  ai_connectors: string[];
}

// Series-distilled cliche lists (from the KO/VI deslop rounds) used to
// top up languages texthumanize's cliches did not cover. Hangul entries
// are 2-3 syllable blocks — do NOT apply latin-oriented length floors.
// JA list: hype expressions from textlint-ja/textlint-rule-preset-ai-writing
// (MIT) + template preambles/closers from public JA AI-slop catalogs.
// Corpus-informed exclusions (coji/natural-japanese calibration, 137
// human / 406 AI texts): 最後に and まさに are HUMAN-frequency words
// (63% of that corpus's false positives) and must stay out.
const SERIES_CLICHES: Record<Lang, string[]> = {
  en: [],
  ru: [],
  es: [
    // EN-tic calques documented across ES AI-slop catalogs
    // (dorelysm/naturalizacion-texto-es SUBSTITUTIONS.md, ES NLP writing
    // guides). Pomposity frames ("cabe destacar", "es importante ...")
    // deliberately NOT duplicated here — they are es:pomposity_frame
    // rules in es-patterns.json (ja dedup policy).
    "en el mundo de", "en la era digital", "juega un papel crucial",
    "juega un papel fundamental", "juega un papel importante",
    "desempeña un papel crucial", "desempeña un papel fundamental",
    "desbloquear el potencial", "en constante evolución", "el panorama de",
    "sumergirse en", "navegar por las complejidades",
  ],
  th: [
    // EN-tic calques + hype from public TH AI-writing guides (TH
    // academic-humanizing tutorials cite เป็นที่ทราบกันดีว่า-class
    // patterns; the cliche set is curated, no upstream catalog exists).
    "ในยุคดิจิทัล", "เป็นเครื่องพิสูจน์ว่า", "มีบทบาทสำคัญ", "ปลดล็อกศักยภาพ",
    "ปฏิวัติวงการ", "เปลี่ยนโลก", "พลิกโฉมวงการ", "ก้าวกระโดดครั้งใหญ่",
  ],
  my: [
    // Minimal seed — no deterministic MY AI-slop catalog exists (see
    // docs/false-positives.md); heavily provisional on purpose.
    "ဒစ်ဂျစ်တယ်ခေတ်", "အရေးပါသောအခန်းကဏ္ဍ",
  ],
  id: [
    // EN-tic calques documented in public ID AI-writing guides
    // (buildwithangga-class tip lists name "di era digital",
    // "tak dapat dipungkiri", "selain itu"-repetition directly).
    "di era digital", "memainkan peran penting", "memainkan peran kunci",
    "membuka potensi", "tak terbantahkan", "mengubah lanskap",
    "terus berevolusi", "menyelami dunia",
  ],
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
  ja: [
    // いかがでしたでしょうか is not a typo-merge of the vendor's split
    // variants: it is the double-keigo closer from the public JA AI-slop
    // catalogs (aismell stem いかがでし covers いかがでしたか /
    // いかがでしょうか / いかがでしたでしょうか alike).
    "革命的", "画期的", "圧倒的に", "劇的に", "完全ガイド", "ゲームチェンジャー",
    "パラダイムシフト", "世界初", "次世代の", "魔法のように", "奇跡的な",
    "業界を再定義", "未来を変える", "と言っても過言ではない", "に他ならない",
    "いかがでしたでしょうか", "お役に立てれば幸い", "本記事では", "ご紹介し",
    "結論から言うと",
  ],
};

// Series-distilled weak signals (bureaucratic/templates) — P2 material
// that matters in repetition, so they surface from their 2nd occurrence.
// ES: curated Tier-2 vocabulary (dorelysm catalog) — ordinary Spanish
// words that AI overuses; weak+count-escalation keeps single legitimate
// uses FP-free. "fundamental" is excluded: the frame "Es fundamental
// que" already carries it in es:pomposity_frame (dedup policy).
const SERIES_WEAK: Partial<Record<Lang, string[]>> = {
  ja: [
    "することが可能", "する必要があります", "と言えるでしょう", "ではないでしょうか",
    "浮き彫り", "これにより", "幸いです", "以下で解説", "一概には言えません",
    "ケースバイケース", "掘り下げ", "多角的", "まず最初に", "活用する",
  ],
  es: [
    "transformar", "fomentar", "explorar", "implementación", "metodología",
    "optimizar", "facilitar", "aprovechar", "integral", "invaluable",
    "requerimiento", "utilización", "cautivar", "hoy en día", "profundizar en",
  ],
  th: [
    "ยกระดับ", "ขับเคลื่อน", "เหนือชั้น", "อย่างแพร่หลาย",
  ],
  my: [],
  id: [
    "mengoptimalkan", "memfasilitasi", "implementasi", "metodologi",
    "revolusioner", "memanfaatkan", "transformasi", "integral",
    "pada akhirnya",
  ],
};

// Length floor by script: latin/cyrillic phrases need >=4 chars to be
// meaningful; hangul/vietnamese-with-marks/kana-kanji/thai/myanmar
// entries are curated lists — no floor (2-3 syllable hangul blocks are
// full words; 3-4 char JA hype adjectives like 革命的 are complete
// markers; unspaced TH/MY orthographies pack whole markers into few
// characters, and ASCII \b-style assumptions do not apply).
function passesLengthFloor(p: string): boolean {
  if (/[\uac00-\ud7af]/.test(p)) return true; // hangul
  if (/[\u1ea0-\u1ef9ăâêôơưđ]/i.test(p)) return true; // vietnamese marks
  if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/.test(p)) return true; // kana/kanji (JA)
  if (/[\u0e00-\u0e7f]/.test(p)) return true; // thai
  if (/[\u1000-\u109f]/.test(p)) return true; // myanmar
  return p.length >= 4;
}

let cache: Record<string, LangDicts> | null = null;
async function loadDicts(): Promise<Record<string, LangDicts>> {
  if (cache) return cache;
  const raw = JSON.parse(
    await Bun.file(configPath("dictionaries/texthumanize-dicts.json")).text(),
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
  readonly langs: Lang[] = [...LANGS];

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
    for (const needle of new Set([...dicts.bureaucratic_phrases, ...dicts.ai_connectors, ...(SERIES_WEAK[lang] ?? [])])) {
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
