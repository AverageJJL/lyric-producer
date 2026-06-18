import React from 'react';

import type {AskReport} from '../../assistant/askReports';

/**
 * Read-only measurement card for "Ask" answers. Purely presentational — unlike the
 * creative option cards it has no actions (Ask never edits or imports). One generic card
 * renders every report kind (summary / clips / density / loudness / masking / reference)
 * as a header + metric chips + optional labelled bars, matching the Logic-dark theme.
 */
export function AskReportCard({report}: {report: AskReport}) {
  return (
    <article className={`ask-report-card ask-report-${report.kind}`}>
      <header className="ask-report-header">
        <strong>{report.title}</strong>
        {report.headline ? <span>{report.headline}</span> : null}
      </header>
      {report.metrics.length > 0 ? (
        <div className="ask-report-metrics">
          {report.metrics.map((metric, index) => (
            <div key={`${report.id}-m${index}`} className="ask-report-metric" title={metric.hint}>
              <span className="ask-report-metric-value">{metric.value}</span>
              <span className="ask-report-metric-label">{metric.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      {report.bars && report.bars.length > 0 ? (
        <div className="ask-report-bars">
          {report.bars.map((bar, index) => (
            <div key={`${report.id}-b${index}`} className="ask-report-bar-row">
              <span className="ask-report-bar-label" title={bar.label}>{bar.label}</span>
              <span className="ask-report-bar-track">
                <span className="ask-report-bar-fill" style={{width: `${Math.round(bar.level * 100)}%`}} />
              </span>
              <span className="ask-report-bar-value">{bar.value}</span>
            </div>
          ))}
        </div>
      ) : null}
      {report.note ? <p className="ask-report-note">{report.note}</p> : null}
    </article>
  );
}
