import {
  rootAddTrackOptions,
  virtualInstrumentSections,
} from '../src/music/addTrackCatalog';
import { instrumentById } from '../src/music/instruments';

describe('addTrackCatalog', () => {
  it('lists three root add-track options', () => {
    const options = rootAddTrackOptions();
    expect(options.map(o => o.id)).toEqual([
      'virtual_instrument',
      'drum_machine',
      'voice_audio',
    ]);
    expect(options.find(o => o.id === 'virtual_instrument')?.hasSubmenu).toBe(
      true,
    );
    expect(options.find(o => o.id === 'drum_machine')?.hasSubmenu).toBe(false);
  });

  it('groups virtual presets under taxonomy categories and subcategories in order', () => {
    const sections = virtualInstrumentSections();
    expect(sections.map(s => s.heading)).toEqual([
      'Keys',
      'Bass',
      'Guitar',
      'Lead',
      'Pad',
      'Strings',
      'Winds',
      'Brass',
      'Mallets',
    ]);
    expect(sections[0].subcategories.map(s => s.heading)).toEqual([
      'Piano',
      'Electric Piano',
      'Organ',
    ]);
    expect(sections[1].subcategories.map(s => s.heading)).toEqual([
      'Electric Bass',
      'Synth Bass',
      '808',
    ]);
  });

  it('exposes all virtual instrument preset picks with valid ids', () => {
    const sections = virtualInstrumentSections();
    const picks = sections.flatMap(s =>
      s.subcategories.flatMap(subcategory => subcategory.items),
    );
    expect(picks).toHaveLength(14);

    picks.forEach(pick => {
      const instrument = instrumentById(pick.instrumentId);
      expect(instrument).toBeDefined();
      expect(instrument?.presets.some(p => p.id === pick.presetId)).toBe(true);
      expect(pick.label.length).toBeGreaterThan(0);
      expect(pick.subcategory.length).toBeGreaterThan(0);
    });
  });
});
