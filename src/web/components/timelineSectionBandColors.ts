import type {SectionMarker} from '../../store/projectMetadata';

export type TimelineSectionBandTone = {
  key: string;
  background: string;
  border: string;
};

const FALLBACK_TONES: TimelineSectionBandTone[] = [
  {key: 'sea-glass', background: 'linear-gradient(135deg, rgba(58, 190, 174, 0.18), rgba(81, 142, 220, 0.1))', border: 'rgba(91, 211, 194, 0.3)'},
  {key: 'rose-copper', background: 'linear-gradient(135deg, rgba(224, 91, 118, 0.17), rgba(239, 153, 89, 0.1))', border: 'rgba(229, 112, 132, 0.28)'},
  {key: 'honey-lime', background: 'linear-gradient(135deg, rgba(233, 178, 70, 0.16), rgba(146, 188, 84, 0.1))', border: 'rgba(236, 190, 93, 0.28)'},
  {key: 'electric-blue', background: 'linear-gradient(135deg, rgba(76, 145, 236, 0.18), rgba(60, 205, 220, 0.1))', border: 'rgba(104, 171, 244, 0.3)'},
  {key: 'violet-wine', background: 'linear-gradient(135deg, rgba(165, 117, 228, 0.17), rgba(218, 83, 151, 0.09))', border: 'rgba(179, 135, 232, 0.28)'},
  {key: 'sage-teal', background: 'linear-gradient(135deg, rgba(144, 186, 92, 0.15), rgba(52, 173, 144, 0.1))', border: 'rgba(159, 198, 107, 0.26)'},
  {key: 'apricot-plum', background: 'linear-gradient(135deg, rgba(238, 139, 93, 0.15), rgba(154, 104, 209, 0.1))', border: 'rgba(237, 151, 104, 0.26)'},
  {key: 'mint-indigo', background: 'linear-gradient(135deg, rgba(74, 205, 157, 0.15), rgba(103, 119, 226, 0.1))', border: 'rgba(105, 217, 177, 0.26)'},
];

function normalizedSectionName(section: SectionMarker): string {
  return section.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function stableIndex(value: string, count: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return count === 0 ? 0 : hash % count;
}

function fallbackToneIndex(section: SectionMarker, index: number): number {
  const name = normalizedSectionName(section);
  if (/\bintro\b/.test(name)) return 0;
  if (/\bverse\b/.test(name)) return 1;
  if (/\b(pre chorus|prechorus|build|rise|lift)\b/.test(name)) return 2;
  if (/\b(chorus|hook|drop)\b/.test(name)) return 3;
  if (/\b(bridge|break|middle 8|middle eight)\b/.test(name)) return 4;
  if (/\b(outro|ending|end)\b/.test(name)) return 5;
  return stableIndex(name || section.id || String(index), FALLBACK_TONES.length);
}

export function sectionBandTone(
  section: SectionMarker,
  index: number,
  previousToneKey?: string,
): TimelineSectionBandTone {
  let toneIndex = fallbackToneIndex(section, index);
  if (FALLBACK_TONES[toneIndex]?.key === previousToneKey) {
    toneIndex = (toneIndex + 1) % FALLBACK_TONES.length;
  }
  return FALLBACK_TONES[toneIndex]!;
}
