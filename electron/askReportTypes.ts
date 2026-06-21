/**
 * Main-process mirror of the renderer's AskReport card shape (electron tsconfig cannot
 * import from src/). The Ask analysis tools BUILD these; the renderer re-sanitizes them
 * (src/assistant/askReports.ts) before rendering/persisting. Keep the two in sync.
 */

export type AskReportKind = 'summary' | 'clips' | 'blocks' | 'density' | 'loudness' | 'masking' | 'reference';

export type AskReportMetric = {label: string; value: string; hint?: string};
export type AskReportBar = {label: string; value: string; level: number};

export type AskReport = {
  id: string;
  kind: AskReportKind;
  title: string;
  headline: string;
  metrics: AskReportMetric[];
  bars?: AskReportBar[];
  note?: string;
};

/** Return shape of every Ask analysis tool: model-facing `result` + an optional card. */
export type AskToolResult = {result: unknown; report?: AskReport};
