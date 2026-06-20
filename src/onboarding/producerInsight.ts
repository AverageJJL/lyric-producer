import type {ProducerInsight} from '../store/projectMetadata';

type ProducerInsightInput = {
  sectionName: string;
  lyrics: string[];
  hook: boolean;
  title?: string;
  artist?: string;
  publicContext?: string;
};

function sectionRole(name: string): 'intro' | 'verse' | 'pre' | 'chorus' | 'bridge' | 'outro' {
  const lower = name.toLowerCase();
  if (lower.includes('bridge')) return 'bridge';
  if (lower.includes('chorus')) return 'chorus';
  if (lower.includes('pre')) return 'pre';
  if (lower.includes('outro')) return 'outro';
  if (lower.includes('intro')) return 'intro';
  return 'verse';
}

function lyricTilt(lyrics: string[]): string {
  const text = lyrics.join(' ').toLowerCase();
  if (/\b(god|heaven|magic|angel|sin)\b/.test(text)) return 'heightened';
  if (/\b(game|madness|rumor|mistake|break|lie|fight)\b/.test(text)) return 'tension';
  if (/\b(love|heart|touch|kiss|want|need)\b/.test(text)) return 'romance';
  if (/\b(money|suit|gold|king|queen|party)\b/.test(text)) return 'gloss';
  if (/\b(alone|night|cry|cold|empty|silence)\b/.test(text)) return 'isolation';
  return 'neutral';
}

function paletteFromContext(context: string | undefined): string | null {
  if (!context) return null;
  const lower = context.toLowerCase();
  const parts = [
    lower.includes('drum') ? 'programmed drums' : '',
    lower.includes('synth') ? 'sparse synth layers' : '',
    lower.includes('guitar') ? 'percussion guitar' : '',
    lower.includes('bass') ? 'controlled low end' : '',
    lower.includes('vocal') ? 'layered backing vocals' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function createProducerInsight(input: ProducerInsightInput): ProducerInsight {
  const role = sectionRole(input.sectionName);
  const tilt = lyricTilt(input.lyrics);
  const publicPalette = paletteFromContext(input.publicContext);
  const palette = publicPalette ?? (input.hook
    ? 'wide drums, bright chord layer, doubled hook vocal'
    : 'tight rhythm bed, filtered harmony, close lead vocal');
  const colorMove = tilt === 'tension'
    ? 'keep the groove clipped and controlled so the lyric feels dangerous'
    : tilt === 'romance'
      ? 'leave extra air around the vocal so the intimacy survives'
      : tilt === 'gloss'
        ? 'add polished top-end texture without crowding the lead'
        : tilt === 'isolation'
          ? 'thin the low mids and let silence frame the line'
          : 'make one clear production change, then leave space around it';
  const base: Record<typeof role, ProducerInsight> = {
    intro: {
      intent: 'Establish the sonic signature before the story starts.',
      arrangementMove: `Open with one identifiable texture and a restrained pulse; ${colorMove}.`,
      vocalTreatment: 'Keep the first vocal close, dry, and slightly forward.',
      soundPalette: palette,
      mixFocus: 'Prioritize the hook texture and vocal entry over low-end weight.',
      risk: 'Avoid giving away the full chorus density too early.',
    },
    verse: {
      intent: 'Make the lyric feel conversational and specific.',
      arrangementMove: `Hold drums and bass tight, then add small ear-candy responses between phrases; ${colorMove}.`,
      vocalTreatment: 'Use a centered lead with minimal doubles and short ambience.',
      soundPalette: palette,
      mixFocus: 'Keep vocal consonants and the groove pocket clear.',
      risk: 'Do not overcrowd the verse with chorus-sized layers.',
    },
    pre: {
      intent: 'Build pressure without spending the chorus payoff.',
      arrangementMove: `Lift the hats, bass movement, or chord register every two bars; ${colorMove}.`,
      vocalTreatment: 'Add light doubles or a tucked harmony on phrase endings.',
      soundPalette: palette,
      mixFocus: 'Let rising rhythm and vocal lift beat sheer loudness.',
      risk: 'Avoid a transition that peaks before the chorus arrives.',
    },
    chorus: {
      intent: 'Turn the lyric into the section people remember.',
      arrangementMove: `Widen drums and harmony, reinforce downbeats, and make the hook feel inevitable; ${colorMove}.`,
      vocalTreatment: 'Stack doubles wider than the verse and reserve adlibs for later repeats.',
      soundPalette: palette,
      mixFocus: 'Put the lead vocal and hook rhythm in front; keep pads behind them.',
      risk: 'Do not add so many layers that the hook loses its shape.',
    },
    bridge: {
      intent: 'Create contrast so the final hook feels earned.',
      arrangementMove: `Drop or filter the core groove, change register, and reset the listener; ${colorMove}.`,
      vocalTreatment: 'Try a more exposed delivery, then widen into the final pickup.',
      soundPalette: palette,
      mixFocus: 'Let the contrast read clearly before rebuilding density.',
      risk: 'Avoid making the bridge feel like another verse with a new label.',
    },
    outro: {
      intent: 'Release the song while leaving one memorable texture behind.',
      arrangementMove: `Strip back to the signature motif or vocal fragment; ${colorMove}.`,
      vocalTreatment: 'Let the last vocal phrase decay naturally or answer it with a quiet double.',
      soundPalette: palette,
      mixFocus: 'Fade arrangement detail before fading emotional focus.',
      risk: 'Avoid ending with a sudden energy drop unless the lyric asks for it.',
    },
  };
  return base[role];
}
