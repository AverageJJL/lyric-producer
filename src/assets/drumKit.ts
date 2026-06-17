/** Canonical drum sample keys shared between UI and native engine. */
export const DRUM_SAMPLE_KEYS = [
  'kick',
  'snare',
  'hatClosed',
  'hatOpen',
  'tom1',
  'tom2',
  'perc',
  'clap',
] as const;

export type DrumSampleKey = (typeof DRUM_SAMPLE_KEYS)[number];

export const POP_DRUM_KIT_ID = 'pop_basic';

/** Human-readable lane labels for the step sequencer Y-axis. */
export const DRUM_LANE_LABELS: Record<DrumSampleKey, string> = {
  kick: 'Kick',
  snare: 'Snare',
  hatClosed: 'CHat',
  hatOpen: 'OHat',
  tom1: 'Tom 1',
  tom2: 'Tom 2',
  perc: 'Perc',
  clap: 'Clap',
};

/** Full instrument names shown on lane icon hover. */
export const DRUM_LANE_TOOLTIPS: Record<DrumSampleKey, string> = {
  kick: 'Kick Drum',
  snare: 'Snare Drum',
  hatClosed: 'Closed Hi-Hat',
  hatOpen: 'Open Hi-Hat',
  tom1: 'Tom 1',
  tom2: 'Tom 2',
  perc: 'Percussion',
  clap: 'Hand Clap',
};

/** Monochrome lane icons for the step sequencer (24×24). */
export const DRUM_LANE_ICONS: Record<DrumSampleKey, string> = {
  kick: 'drums/icons/kick.png',
  snare: 'drums/icons/snare.png',
  hatClosed: 'drums/icons/hatClosed.png',
  hatOpen: 'drums/icons/hatOpen.png',
  tom1: 'drums/icons/tom1.png',
  tom2: 'drums/icons/tom2.png',
  perc: 'drums/icons/perc.png',
  clap: 'drums/icons/clap.png',
};

export function drumSampleRelativePath(key: DrumSampleKey): string {
  return `sample-library/core-drums/${key}.wav`;
}

const POP_DRUM_KIT_SAMPLE_MAP: Record<DrumSampleKey, string> = {
  kick: drumSampleRelativePath('kick'),
  snare: drumSampleRelativePath('snare'),
  hatClosed: drumSampleRelativePath('hatClosed'),
  hatOpen: drumSampleRelativePath('hatOpen'),
  tom1: drumSampleRelativePath('tom1'),
  tom2: drumSampleRelativePath('tom2'),
  perc: drumSampleRelativePath('perc'),
  clap: drumSampleRelativePath('clap'),
};

export function buildDrumKitSampleMap(): Record<DrumSampleKey, string> {
  return {...POP_DRUM_KIT_SAMPLE_MAP};
}
