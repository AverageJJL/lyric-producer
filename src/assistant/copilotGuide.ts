export type StaticGuideTargetId =
  | 'add-track-button'
  | 'import-audio-button'
  | 'import-midi-button'
  | 'samples-button'
  | 'browser-button'
  | 'audio-settings-button'
  | 'mixer-button'
  | 'copilot-button'
  | 'play-button'
  | 'record-button'
  | 'click-button'
  | 'bpm-control'
  | 'track-record-arm'
  | 'track-mute'
  | 'track-solo'
  | 'track-details';

export type GuideTargetId = StaticGuideTargetId | (string & {});

export type GuideTarget = {
  id: GuideTargetId;
  label: string;
  location: string;
  purpose: string;
};

export const GUIDE_TARGETS: GuideTarget[] = [
  {
    id: 'add-track-button',
    label: '+ Add track',
    location: 'left Tracks sidebar',
    purpose: 'Create software instrument, drum machine, or voice/audio tracks.',
  },
  {
    id: 'import-audio-button',
    label: 'Import Audio',
    location: 'left Tracks sidebar below Add track',
    purpose: 'Import audio files into the project through the native analysis path.',
  },
  {
    id: 'import-midi-button',
    label: 'Import MIDI',
    location: 'left Tracks sidebar below Add track',
    purpose: 'Import MIDI files as editable timeline clips.',
  },
  {
    id: 'samples-button',
    label: 'Samples',
    location: 'top-right toolbar',
    purpose: 'Open the sample provider browser.',
  },
  {
    id: 'browser-button',
    label: 'Browser',
    location: 'top-right toolbar',
    purpose: 'Open project media, takes, relinking, and consolidation tools.',
  },
  {
    id: 'audio-settings-button',
    label: 'Audio settings',
    location: 'top-right toolbar',
    purpose: 'Open audio device, input, sample-rate, buffer, and meter settings.',
  },
  {
    id: 'mixer-button',
    label: 'Mixer',
    location: 'top-right toolbar',
    purpose: 'Open the mixer dock with channel strips and master controls.',
  },
  {
    id: 'copilot-button',
    label: 'Copilot',
    location: 'top-right toolbar',
    purpose: 'Open this AI copilot sidebar.',
  },
  {
    id: 'play-button',
    label: 'Play',
    location: 'top transport controls',
    purpose: 'Start or stop transport playback.',
  },
  {
    id: 'record-button',
    label: 'Record',
    location: 'top transport controls',
    purpose: 'Start or stop recording after a track is armed.',
  },
  {
    id: 'click-button',
    label: 'Click',
    location: 'top project display',
    purpose: 'Toggle the metronome click track.',
  },
  {
    id: 'bpm-control',
    label: 'Tempo BPM',
    location: 'center transport display',
    purpose: 'Edit the project tempo.',
  },
  {
    id: 'track-record-arm',
    label: 'Track record arm',
    location: 'track row controls',
    purpose: 'Arm a track so it can record MIDI or audio.',
  },
  {
    id: 'track-mute',
    label: 'Track mute',
    location: 'track row controls',
    purpose: 'Mute a track during playback.',
  },
  {
    id: 'track-solo',
    label: 'Track solo',
    location: 'track row controls',
    purpose: 'Solo a track during playback.',
  },
  {
    id: 'track-details',
    label: 'Track details',
    location: 'track row controls',
    purpose: 'Open deeper track controls for routing, automation, organization, and mix settings.',
  },
];

export const GUIDE_TARGET_IDS = Object.fromEntries(
  GUIDE_TARGETS.map(target => [target.id, target.id]),
) as Record<StaticGuideTargetId, StaticGuideTargetId>;

export const GUIDE_TARGET_ID_SET = new Set<GuideTargetId>(
  GUIDE_TARGETS.map(target => target.id),
);
