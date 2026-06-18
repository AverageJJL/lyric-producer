import React from 'react';
import {cleanup, render, screen} from '@testing-library/react';

import {AskReportCard} from '../src/web/components/AskReportCard';
import {sanitizeAskReports, type AskReport} from '../src/assistant/askReports';

afterEach(cleanup);

const REPORT: AskReport = {
  id: 'r1',
  kind: 'loudness',
  title: 'Loudness · Lead Vocal',
  headline: 'Integrated -14.2 LUFS, peak -1.1 dB',
  metrics: [
    {label: 'Integrated', value: '-14.2 LUFS'},
    {label: 'Peak', value: '-1.1 dBFS'},
  ],
  bars: [{label: '20–120Hz', value: 'B +8.0 dB', level: 0.83}],
  note: 'Loudness-matched comparison.',
};

describe('AskReportCard', () => {
  it('renders the title, headline, metrics, bars and note', () => {
    render(<AskReportCard report={REPORT} />);
    expect(screen.getByText('Loudness · Lead Vocal')).toBeInTheDocument();
    expect(screen.getByText('Integrated -14.2 LUFS, peak -1.1 dB')).toBeInTheDocument();
    expect(screen.getByText('-14.2 LUFS')).toBeInTheDocument();
    expect(screen.getByText('Integrated')).toBeInTheDocument();
    expect(screen.getByText('20–120Hz')).toBeInTheDocument();
    expect(screen.getByText('Loudness-matched comparison.')).toBeInTheDocument();
  });

  it('sets the bar fill width from the (clamped) level', () => {
    const {container} = render(<AskReportCard report={REPORT} />);
    const fill = container.querySelector('.ask-report-bar-fill') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.style.width).toBe('83%');
  });

  it('omits the bars block when there are none', () => {
    const {container} = render(<AskReportCard report={{...REPORT, bars: undefined}} />);
    expect(container.querySelector('.ask-report-bars')).toBeNull();
  });
});

describe('sanitizeAskReports', () => {
  it('keeps valid reports and applies the kind/level/length guards', () => {
    const reports = sanitizeAskReports([
      {id: 'a', kind: 'summary', title: 'Summary', headline: 'ok', metrics: [{label: 'Tracks', value: '2'}]},
      {kind: 'bogus', title: 'nope', metrics: []}, // invalid kind -> dropped
      {kind: 'masking', title: '', metrics: []}, // empty title -> dropped
      {id: 'b', kind: 'density', title: 'D', headline: '', metrics: [], bars: [{label: 'T', value: '90%', level: 5}]},
    ]);
    expect(reports.map(report => report.kind)).toEqual(['summary', 'density']);
    expect(reports[1].bars?.[0].level).toBe(1); // clamped from 5
  });

  it('drops metrics missing a label or value', () => {
    const [report] = sanitizeAskReports([
      {kind: 'loudness', title: 'L', metrics: [{label: 'Integrated', value: '-14 LUFS'}, {label: 'NoValue'}, {value: 'NoLabel'}]},
    ]);
    expect(report.metrics).toHaveLength(1);
    expect(report.metrics[0]).toEqual({label: 'Integrated', value: '-14 LUFS'});
  });

  it('returns an empty array for non-array input', () => {
    expect(sanitizeAskReports(undefined)).toEqual([]);
    expect(sanitizeAskReports('nope')).toEqual([]);
  });
});
