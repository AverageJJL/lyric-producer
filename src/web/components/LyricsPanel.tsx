import {Fragment, type PointerEvent, useEffect, useMemo, useRef, useState} from 'react';

import {checkSongSeedLyricsSimilarity} from '../../native/songSeedApi';
import {
  beatToLyricTimeInput,
  lyricTimeInputToBeat,
  resolveLyricHighlight,
  splitLyricWords,
  type LyricSection,
} from '../../store/lyrics';
import {useDAWStore} from '../../store/useDAWStore';
import {
  ClockHistoryIcon,
  DeleteLeftIcon,
  PlusIcon,
  RefreshGuideIcon,
} from './icons/WorkspaceIcons';
import {LyricsPanelAnalysisControls} from './LyricsPanelAnalysisControls';

type LyricsPanelProps = {
  areColoredSectionsHidden?: boolean;
  onColoredSectionsHiddenChange?: (hidden: boolean) => void;
};

type TimestampInputProps = {
  label: string;
  beat?: number;
  bpm: number;
  tempoMap: ReturnType<typeof useDAWStore.getState>['tempoMap'];
  onCommit: (beat: number | undefined) => void;
};

function TimestampInput({label, beat, bpm, tempoMap, onCommit}: TimestampInputProps) {
  const [draft, setDraft] = useState(() => beatToLyricTimeInput(beat, bpm, tempoMap));
  useEffect(() => setDraft(beatToLyricTimeInput(beat, bpm, tempoMap)), [beat, bpm, tempoMap]);
  return (
    <input
      className="lyrics-time-input"
      aria-label={label}
      value={draft}
      placeholder="0:00.00"
      onChange={event => setDraft(event.target.value)}
      onBlur={() => onCommit(draft.trim() ? lyricTimeInputToBeat(draft, bpm, tempoMap) : undefined)}
    />
  );
}

function SectionNameInput({
  section,
  onRename,
}: {
  section: LyricSection;
  onRename: (sectionId: string, name: string) => void;
}) {
  const [draft, setDraft] = useState(section.name);
  useEffect(() => setDraft(section.name), [section.name]);
  return (
    <input
      className="lyrics-section-name"
      aria-label={`${section.name} name`}
      value={draft}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => onRename(section.id, draft)}
    />
  );
}

function resizeLineInput(node: HTMLTextAreaElement): void {
  node.style.height = '0px';
  node.style.height = `${Math.max(34, node.scrollHeight)}px`;
}

function targetKeepsOwnFocus(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('input, textarea, button, label'));
}

function LyricWordPreview({text, activeWordIndex}: {text: string; activeWordIndex: number}) {
  const words = splitLyricWords(text);
  return (
    <div className="lyrics-line-playback" aria-hidden="true">
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className={`lyrics-word ${index <= activeWordIndex ? 'is-lit' : ''}`}>
            {word}
          </span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </div>
  );
}

export function LyricsPanel({
  areColoredSectionsHidden = false,
  onColoredSectionsHiddenChange,
}: LyricsPanelProps) {
  const lyrics = useDAWStore(state => state.lyrics);
  const bpm = useDAWStore(state => state.bpm);
  const tempoMap = useDAWStore(state => state.tempoMap);
  const isPlaying = useDAWStore(state => state.isPlaying);
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const addSection = useDAWStore(state => state.addLyricSection);
  const removeSection = useDAWStore(state => state.removeLyricSection);
  const renameSection = useDAWStore(state => state.renameLyricSection);
  const setSectionTiming = useDAWStore(state => state.setLyricSectionTiming);
  const addLine = useDAWStore(state => state.addLyricLine);
  const removeLine = useDAWStore(state => state.removeLyricLine);
  const updateLineText = useDAWStore(state => state.updateLyricLineText);
  const setLineTiming = useDAWStore(state => state.setLyricLineTiming);
  const stampLine = useDAWStore(state => state.stampLyricLine);
  const syncTimings = useDAWStore(state => state.syncLyricTimings);
  const setSimilarityReport = useDAWStore(state => state.setLyricSimilarityReport);
  const removeLyricAnalysis = useDAWStore(state => state.removeLyricAnalysis);
  const lineRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const [pendingFocusLineId, setPendingFocusLineId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{sectionId: string; lineId?: string}>(() => ({
    sectionId: lyrics.sections[0]?.id ?? '',
  }));
  const [checkState, setCheckState] = useState<'idle' | 'checking' | 'error'>('idle');
  const highlight = useMemo(() => resolveLyricHighlight(lyrics, playheadBeat), [lyrics, playheadBeat]);
  const selectedSection = lyrics.sections.find(section => section.id === selected.sectionId)
    ?? lyrics.sections[0];
  const selectedLine = selectedSection?.lines.find(line => line.id === selected.lineId)
    ?? selectedSection?.lines[0];

  useEffect(() => {
    lineRefs.current.forEach(resizeLineInput);
    if (!pendingFocusLineId) return;
    const next = lineRefs.current.get(pendingFocusLineId);
    if (!next) return;
    next.focus();
    next.selectionStart = next.value.length;
    next.selectionEnd = next.value.length;
    setPendingFocusLineId(null);
  }, [lyrics, pendingFocusLineId, selected.sectionId, selected.lineId]);

  const focusSectionFromSurface = (section: LyricSection, event: PointerEvent<HTMLElement>) => {
    const firstLineId = section.lines[0]?.id;
    const keepNativeFocus = targetKeepsOwnFocus(event.target);
    setSelected(current => keepNativeFocus ? {...current, sectionId: section.id} : {sectionId: section.id, lineId: firstLineId});
    if (!keepNativeFocus && firstLineId) {
      setPendingFocusLineId(firstLineId);
    }
  };

  const runSimilarityCheck = async () => {
    const lines = lyrics.sections.flatMap(section => section.lines).filter(line => line.text.trim());
    setCheckState('checking');
    const response = await checkSongSeedLyricsSimilarity({
      lyrics: lines.map(line => line.text).join('\n'),
      lineIds: lines.map(line => line.id),
    });
    if (response?.ok) {
      setSimilarityReport(response.report);
      setCheckState('idle');
      return;
    }
    setSimilarityReport({
      checkedAt: new Date().toISOString(),
      risk: 'unavailable',
      matches: [],
      note: response?.error ?? 'Similarity check is unavailable.',
    });
    setCheckState('error');
  };

  return (
    <section className={`lyrics-panel ${isPlaying ? 'is-playing' : ''}`} aria-label="Lyrics editor">
      <div className="lyrics-panel-toolbar" role="group" aria-label="Lyrics tools">
        <button
          type="button"
          aria-label="Stamp selected line"
          title="Set the selected lyric line to the current playhead time."
          data-tooltip="Set selected line to playhead time"
          onClick={() => selectedSection && selectedLine && stampLine(selectedSection.id, selectedLine.id)}>
          <ClockHistoryIcon className="lyrics-tool-icon" />
        </button>
        <button
          type="button"
          aria-label="Sync lyric timings"
          title="Auto-fill section ends and line start times from lyric length."
          data-tooltip="Auto-fill lyric timings"
          onClick={syncTimings}>
          <RefreshGuideIcon className="lyrics-tool-icon" />
        </button>
        <button
          type="button"
          className="lyrics-similarity-button"
          aria-label="Check Similarity"
          title="Compare your lyrics against candidate songs and show similarity risk."
          data-tooltip="Check lyric similarity"
          disabled={checkState === 'checking'}
          onClick={() => void runSimilarityCheck()}>
          <span>Check Similarity</span>
          <span className="lyrics-similarity-spinner" aria-hidden="true" />
        </button>
        <LyricsPanelAnalysisControls
          areColoredSectionsHidden={areColoredSectionsHidden}
          onColoredSectionsHiddenChange={onColoredSectionsHiddenChange}
          onRemoveLyricAnalysis={removeLyricAnalysis}
        />
      </div>
      <div className="lyrics-editor-stack">
        {lyrics.sections.map(section => {
          const playbackActive = isPlaying && highlight?.sectionId === section.id;
          return (
            <article
              key={section.id}
              className={`lyrics-editor-section ${selected.sectionId === section.id ? 'is-selected' : ''} ${playbackActive ? 'is-playback-active' : ''}`}
              onFocusCapture={() => setSelected(current => ({...current, sectionId: section.id}))}
              onPointerDown={event => focusSectionFromSurface(section, event)}>
              <div className="lyrics-section-head">
                <SectionNameInput section={section} onRename={renameSection} />
                <div className="lyrics-section-times">
                  <label className="lyrics-section-time-field">
                    <span>Start</span>
                    <TimestampInput label={`${section.name} section start time`} beat={section.startBeat} bpm={bpm} tempoMap={tempoMap} onCommit={beat => setSectionTiming(section.id, 'startBeat', beat)} />
                  </label>
                  <label className="lyrics-section-time-field">
                    <span>End</span>
                    <TimestampInput label={`${section.name} section end time`} beat={section.endBeat} bpm={bpm} tempoMap={tempoMap} onCommit={beat => setSectionTiming(section.id, 'endBeat', beat)} />
                  </label>
                </div>
                <button type="button" className="lyrics-delete-section" aria-label={`Delete ${section.name}`} onClick={() => removeSection(section.id)}>
                  <DeleteLeftIcon className="lyrics-tool-icon" />
                </button>
              </div>
              <div className="lyrics-line-list">
                {section.lines.map(line => {
                  const lineActive = isPlaying && highlight?.lineId === line.id;
                  return (
                    <div key={line.id} className={`lyrics-line-row ${lineActive ? 'is-active' : ''}`}>
                      <TimestampInput label={`${section.name} line time`} beat={line.startBeat} bpm={bpm} tempoMap={tempoMap} onCommit={beat => setLineTiming(section.id, line.id, beat)} />
                      <div className="lyrics-line-input-wrap">
                        <textarea
                          rows={1}
                          className="lyrics-line-input"
                          aria-label={`${section.name} lyric line`}
                          ref={node => {
                            if (node) {
                              lineRefs.current.set(line.id, node);
                              resizeLineInput(node);
                            } else {
                              lineRefs.current.delete(line.id);
                            }
                          }}
                          value={line.text}
                          onFocus={() => setSelected({sectionId: section.id, lineId: line.id})}
                          onChange={event => {
                            resizeLineInput(event.currentTarget);
                            updateLineText(section.id, line.id, event.target.value);
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              const id = addLine(section.id, line.id);
                              if (id) {
                                setSelected({sectionId: section.id, lineId: id});
                                setPendingFocusLineId(id);
                              }
                            }
                          }}
                        />
                        {lineActive ? <LyricWordPreview text={line.text} activeWordIndex={highlight?.activeWordIndex ?? 0} /> : null}
                      </div>
                      <button type="button" className="lyrics-delete-line" aria-label="Delete lyric line" onClick={() => removeLine(section.id, line.id)}>
                        <DeleteLeftIcon className="lyrics-tool-icon" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
        <button
          type="button"
          className="lyrics-add-section"
          aria-label="Add lyric section"
          onClick={() => addSection(lyrics.sections[lyrics.sections.length - 1]?.id)}>
          <PlusIcon className="lyrics-tool-icon" />
        </button>
      </div>
      {lyrics.similarityReport ? (
        <aside className={`lyrics-similarity-report ${lyrics.similarityReport.risk}`} aria-label="Lyric similarity report">
          <strong>{lyrics.similarityReport.risk}</strong>
          {lyrics.similarityReport.matches.slice(0, 3).map(match => (
            <p key={match.candidateId}>
              {match.title}{match.artist ? ` - ${match.artist}` : ''} · {Math.round(match.score * 100)}%
            </p>
          ))}
          {lyrics.similarityReport.note ? <small>{lyrics.similarityReport.note}</small> : null}
        </aside>
      ) : null}
    </section>
  );
}
