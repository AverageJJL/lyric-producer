/**
 * Deferred: not mounted in the main DAW inspector. Intended for a future
 * assisted project startup flow (empty project vs head start, vibe Q&A,
 * swipe-to-pick samples, then import into a new session).
 */
import React, {useMemo, useState} from 'react';

import {
  buildStructureSections,
  curateSampleStack,
  STRUCTURE_TEMPLATES,
  type StructureTemplateId,
} from '../../arrangement/structureStacking';
import type {SampleProviderEntry} from '../../native/mediaImportApi';
import type {SectionMarker} from '../../store/projectMetadata';
import type {ProjectPerformanceMode} from '../../transport/performanceMode';

type StructureStackPanelProps = {
  samples: SampleProviderEntry[];
  query: string;
  beatsPerBar: number;
  performanceMode: ProjectPerformanceMode;
  isImportingAudio: boolean;
  onSearch: (query: string) => void;
  onImportSample: (absolutePath: string) => void;
  onCreateSections: (sections: SectionMarker[]) => void;
};

export function StructureStackPanel({
  samples,
  query,
  beatsPerBar,
  performanceMode,
  isImportingAudio,
  onSearch,
  onImportSample,
  onCreateSections,
}: StructureStackPanelProps) {
  const [mood, setMood] = useState(query);
  const [templateId, setTemplateId] = useState<StructureTemplateId>('beat_sketch');
  const picks = useMemo(
    () => curateSampleStack({samples, query: mood, count: 4}),
    [mood, samples],
  );
  const isLooper = performanceMode === 'looper';

  const handleFindSamples = () => {
    onSearch(mood);
  };

  const handleCreateSections = () => {
    onCreateSections(buildStructureSections({templateId, beatsPerBar}));
  };

  return (
    <section className="inspector-card structure-stack-panel" aria-label="Structure stack">
      <div className="inspector-title">
        <span>Structure</span>
        <strong>{isLooper ? 'Looper' : 'Linear'}</strong>
      </div>
      <div className="structure-stack-controls">
        <input
          aria-label="Mood or genre"
          value={mood}
          placeholder="Mood / genre"
          onChange={event => setMood(event.currentTarget.value)}
        />
        <select
          aria-label="Structure template"
          value={templateId}
          onChange={event => setTemplateId(event.currentTarget.value as StructureTemplateId)}>
          {STRUCTURE_TEMPLATES.map(template => (
            <option key={template.id} value={template.id}>{template.label}</option>
          ))}
        </select>
      </div>
      <div className="structure-stack-actions">
        <button type="button" onClick={handleFindSamples}>
          Find Samples
        </button>
        <button type="button" onClick={handleCreateSections} disabled={isLooper}>
          Create Sections
        </button>
      </div>
      <div className="structure-stack-list">
        {picks.length === 0 ? (
          <span className="structure-stack-empty">No matching provider samples.</span>
        ) : picks.map(pick => (
          <div key={pick.roleId} className="structure-stack-row">
            <div>
              <small>{pick.roleLabel}</small>
              <span>{pick.sample.name}</span>
            </div>
            <button
              type="button"
              disabled={isImportingAudio}
              onClick={() => onImportSample(pick.sample.absolutePath)}
              aria-label={`Import ${pick.roleLabel} sample ${pick.sample.name}`}>
              Import
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
