/** Ambient declarations for imports that ship no TypeScript types:
 *  raw-asset imports (with { type: "file" }) resolve to the asset's
 *  Bun.file()-valid path, not to parsed content.
 *
 *  NOTE: no wildcard for "*.json" — plain JSON imports resolve through
 *  resolveJsonModule (typed content); a path-typed wildcard would make
 *  that ambiguous. JSON assets must be imported with
 *  `with { type: "file" }` to get the path form. */
declare module "*.yaml" {
  const path: string;
  export default path;
}
declare module "*.sh" {
  const path: string;
  export default path;
}

/** avoid-ai-writing-detector ships plain CJS without types; only the
 *  analyzeText surface desloper consumes is declared. The full result
 *  document is intentionally open-ended — upstream adds fields freely. */
declare module "avoid-ai-writing-detector/detector/patterns.js" {
  export interface AawStats {
    contextMode?: string;
    sourceMode?: string;
    [key: string]: unknown;
  }
  export interface AawIssue {
    type?: string;
    text?: string;
    severity?: string;
  }
  export interface AawDocument {
    score?: number;
    label?: string;
    document_classification?: string;
    issues?: AawIssue[];
    stats?: AawStats;
    tooShort?: boolean;
    [key: string]: unknown;
  }
  export function analyzeText(
    text: string,
    options?: { contextMode?: string; sourceMode?: string },
  ): AawDocument;
  const detector: { analyzeText: typeof analyzeText };
  export default detector;
}
