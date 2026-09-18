import { describe, expect, test } from "bun:test";
import { basename, join } from "node:path";
import { globSync } from "node:fs";
import { parseConcatenatedJson } from "../src/normalize.ts";
import { analyzeDocument } from "../src/scanners/avoid-ai-writing.ts";
import type { AawDocument } from "avoid-ai-writing-detector/detector/patterns.js";

/**
 * Golden diff: the in-process analyzeDocument() adapter must produce
 * documents structurally equal (deep equality) to the pinned npm bin
 * (node_modules/.bin/avoid-ai-writing) — the AA GATE=6 triage threshold
 * in src/triage.ts was calibrated against bin output, so any drift
 * between adapter and bin silently re-triages EN findings.
 *
 * Accepted deviations, out of scope for this diff (see
 * docs/false-positives.md "Known limitations"):
 * - invalid UTF-8: the bin fails the file (fatal decode → exit 2 →
 *   audit incomplete); the adapter receives replacement-decoded text
 *   and audits on. Fixtures are valid UTF-8 by definition.
 * - per-file timeout: the bin had a 30s subprocess timeout; the
 *   synchronous adapter has none. A hang would surface here as a hung
 *   test run, which is the escalation signal for a Worker wrapper.
 */

// Dev-checkout-only path: the bin exists after `bun install` and is
// never referenced by the scanner itself anymore.
const BIN = join(import.meta.dir, "../node_modules/.bin/avoid-ai-writing");
const ARGS = ["--source-mode", "rendered-markdown", "--context", "technical"];
const FIXTURES = globSync(join(import.meta.dir, "fixtures/**/*.md")).sort();

describe("avoid-ai-writing in-process adapter matches pinned bin output", () => {
  test("bin is available for the diff (bun install ran)", () => {
    expect(FIXTURES.length).toBeGreaterThan(0);
    const proc = Bun.spawnSync([BIN, "--help"]);
    expect(proc.exitCode).toBe(0);
  });

  for (const file of FIXTURES) {
    test(`document equals bin stdout for ${basename(file)}`, async () => {
      const proc = Bun.spawnSync([BIN, ...ARGS, file]);
      expect(proc.exitCode).toBe(0);
      const binDoc = parseConcatenatedJson(
        new TextDecoder().decode(proc.stdout),
      )[0] as AawDocument;
      expect(binDoc).toBeDefined();

      // Same read path as the production cli (Bun.file().text()).
      const adapterDoc = await analyzeDocument(await Bun.file(file).text());
      expect(adapterDoc).toEqual(binDoc);
    });
  }
});
