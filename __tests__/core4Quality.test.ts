import {
  CORE_4_QUALITY_ROLES,
  validateCore4QualityGate,
} from '../src/music/core4Quality';

describe('Core 4 quality gate', () => {
  it('declares the four stabilized product roles', () => {
    expect(CORE_4_QUALITY_ROLES.map(role => role.id)).toEqual([
      'keys_piano',
      'synth_versatile',
      'drum_machine',
      'voice_audio',
    ]);

    expect(CORE_4_QUALITY_ROLES).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'keys_piano',
        requiredNative: 'sample_instrument',
        minSampleRegions: 10,
      }),
      expect.objectContaining({
        id: 'synth_versatile',
        requiredNative: 'four_osc',
      }),
      expect.objectContaining({
        id: 'drum_machine',
        requiredNative: 'sample_kit',
        minSampleKitSlots: 8,
      }),
      expect.objectContaining({
        id: 'voice_audio',
        requiredNative: 'native_capture',
      }),
    ]));
  });

  it('passes with playable catalog and native assignment payloads', () => {
    const gate = validateCore4QualityGate();

    expect(gate.failures).toEqual([]);
    expect(gate.passed).toBe(true);
    expect(gate.results).toHaveLength(4);
    expect(gate.results.every(result => result.passed)).toBe(true);
  });

  it('proves the Core 4 role-specific payload expectations', () => {
    const gate = validateCore4QualityGate();
    const checksFor = (roleId: string) =>
      gate.results.find(result => result.roleId === roleId)?.checks ?? [];

    expect(checksFor('keys_piano')).toEqual(expect.arrayContaining([
      expect.stringContaining('10 pitched sample regions'),
    ]));
    expect(checksFor('synth_versatile')).toEqual(expect.arrayContaining([
      expect.stringContaining('pop_lead is JSON-addressable'),
      expect.stringContaining('warm_pad is JSON-addressable'),
      expect.stringContaining('bass_sub is JSON-addressable'),
      expect.stringContaining('808_sub is JSON-addressable'),
    ]));
    expect(checksFor('drum_machine')).toEqual(expect.arrayContaining([
      expect.stringContaining('8 drum sample lanes'),
    ]));
    expect(checksFor('voice_audio')).toEqual(expect.arrayContaining([
      expect.stringContaining('uses recording capture path'),
    ]));
  });
});
