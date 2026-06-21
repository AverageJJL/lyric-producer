/**
 * Renderer-side contract for "Ask" measurement cards. The read-only Ask mode answers
 * questions about the session grounded in deterministic measurements; each analysis tool
 * returns both model-facing data AND one of these `AskReport`s, which the panel renders as
 * a read-only card. Reports are produced by OUR main-process tool handlers (not freeform by
 * the model), but they cross the IPC + persistence boundaries, so they are sanitized here
 * exactly like midi/drum option cards.
 *
 * Mirrored (structurally) in electron/askReportTypes.ts — the electron tsconfig cannot
 * import from src/.
 */

export type AskReportKind = 'summary' | 'clips' | 'blocks' | 'density' | 'loudness' | 'masking' | 'reference';

/** A single headline number, e.g. {label:'Integrated', value:'-14.2 LUFS'}. */
export type AskReportMetric = {label: string; value: string; hint?: string};

/** A labelled bar row (level is a 0..1 fill), e.g. a per-band energy or per-track density. */
export type AskReportBar = {label: string; value: string; level: number};

export type AskReport = {
  id: string;
  kind: AskReportKind;
  title: string;
  /** One-line plain-language takeaway shown under the title. */
  headline: string;
  metrics: AskReportMetric[];
  bars?: AskReportBar[];
  note?: string;
};

const REPORT_KINDS: readonly AskReportKind[] = [
  'summary',
  'clips',
  'blocks',
  'density',
  'loudness',
  'masking',
  'reference',
];

const MAX_REPORTS = 6;
const MAX_METRICS = 12;
const MAX_BARS = 24;
const TEXT_MAX = 120;
const NOTE_MAX = 280;

function trimmed(value: unknown, max: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  const clean = value.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function clampLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function sanitizeMetrics(value: unknown): AskReportMetric[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const metrics: AskReportMetric[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const label = trimmed(entry.label, TEXT_MAX);
    const valueText = trimmed(entry.value, TEXT_MAX);
    if (!label || !valueText) {
      continue;
    }
    const hint = trimmed(entry.hint, TEXT_MAX);
    metrics.push(hint ? {label, value: valueText, hint} : {label, value: valueText});
    if (metrics.length >= MAX_METRICS) {
      break;
    }
  }
  return metrics;
}

function sanitizeBars(value: unknown): AskReportBar[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const bars: AskReportBar[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const label = trimmed(entry.label, TEXT_MAX);
    if (!label) {
      continue;
    }
    bars.push({label, value: trimmed(entry.value, TEXT_MAX), level: clampLevel(entry.level)});
    if (bars.length >= MAX_BARS) {
      break;
    }
  }
  return bars;
}

function sanitizeReport(value: unknown, index: number): AskReport | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const kind = REPORT_KINDS.includes(entry.kind as AskReportKind)
    ? (entry.kind as AskReportKind)
    : null;
  const title = trimmed(entry.title, TEXT_MAX);
  if (!kind || !title) {
    return null;
  }
  const metrics = sanitizeMetrics(entry.metrics);
  const bars = sanitizeBars(entry.bars);
  const id = trimmed(entry.id, TEXT_MAX) || `ask-report-${index}`;
  const note = trimmed(entry.note, NOTE_MAX);
  const report: AskReport = {
    id,
    kind,
    title,
    headline: trimmed(entry.headline, NOTE_MAX),
    metrics,
  };
  if (bars.length > 0) {
    report.bars = bars;
  }
  if (note) {
    report.note = note;
  }
  return report;
}

/** Validate + cap an untrusted `AskReport[]` (from IPC or restored chat history). */
export function sanitizeAskReports(value: unknown): AskReport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const reports: AskReport[] = [];
  for (let index = 0; index < value.length && reports.length < MAX_REPORTS; index += 1) {
    const report = sanitizeReport(value[index], index);
    if (report) {
      reports.push(report);
    }
  }
  return reports;
}
