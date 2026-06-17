import {sectionMarkersAfterPointerDrag} from '../src/ui/sectionMarkerDrag';
import type {SectionMarker} from '../src/store/projectMetadata';

const baseSections: SectionMarker[] = [
  {id: 'intro', name: 'Intro', startBeat: 4, lengthBeats: 4},
];

test('moves section markers with snap and pointer offset', () => {
  const [section] = sectionMarkersAfterPointerDrag({
    sections: baseSections,
    sectionId: 'intro',
    mode: 'move',
    pointerBeat: 13.2,
    pointerOffsetBeats: 1,
    snapGrid: 'beat',
    beatsPerBar: 4,
    visibleTimelineBeats: 32,
  });

  expect(section).toMatchObject({
    startBeat: 12,
    lengthBeats: 4,
  });
});

test('resizes section marker ends with subdivision snap', () => {
  const [section] = sectionMarkersAfterPointerDrag({
    sections: baseSections,
    sectionId: 'intro',
    mode: 'resize-end',
    pointerBeat: 10.7,
    snapGrid: '1/8',
    beatsPerBar: 4,
    visibleTimelineBeats: 32,
  });

  expect(section).toMatchObject({
    startBeat: 4,
    lengthBeats: 6.5,
  });
});

test('keeps resized marker starts at least one beat from the end', () => {
  const [section] = sectionMarkersAfterPointerDrag({
    sections: baseSections,
    sectionId: 'intro',
    mode: 'resize-start',
    pointerBeat: 12,
    snapGrid: 'beat',
    beatsPerBar: 4,
    visibleTimelineBeats: 32,
  });

  expect(section).toMatchObject({
    startBeat: 7,
    lengthBeats: 1,
  });
});
