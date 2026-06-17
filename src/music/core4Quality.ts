import type {TrackType} from '../store/useDAWStore';
import {
  DRUM_MACHINE_INSTRUMENT,
  instrumentById,
  KEYS_PIANO,
  resolveNativeInstrumentAssignment,
  SYNTH_BASS,
  SYNTH_LEAD,
  SYNTH_PAD,
  VOICE_AUDIO_INSTRUMENT,
} from './instruments';
import type {
  InstrumentDefinition,
  NativeInstrumentAssignment,
  NativeInstrumentId,
} from './instrumentTypes';
import type {SampleInstrumentRegion} from './sampleInstruments';
import {
  createTrackFromTemplate,
  type TrackTemplateId,
} from './trackTemplates';

export type Core4QualityRoleId =
  | 'keys_piano'
  | 'synth_versatile'
  | 'drum_machine'
  | 'voice_audio';

export type Core4QualityRole = {
  id: Core4QualityRoleId;
  label: string;
  templateId: TrackTemplateId;
  trackType: TrackType;
  instrumentIds: string[];
  requiredNative: NativeInstrumentId | 'native_capture';
  minSampleRegions?: number;
  minSampleKitSlots?: number;
};

export type Core4QualityResult = {
  roleId: Core4QualityRoleId;
  label: string;
  passed: boolean;
  checks: string[];
  failures: string[];
};

export type Core4QualityGate = {
  passed: boolean;
  results: Core4QualityResult[];
  failures: string[];
};

// This gate stays catalog-facing on purpose: it proves the UI can create the
// four product-critical roles without smuggling any DSP or audio parsing into JS.
export const CORE_4_QUALITY_ROLES: Core4QualityRole[] = [
  {
    id: 'keys_piano',
    label: 'Keys / Piano',
    templateId: 'virtual_instrument',
    trackType: 'software_instrument',
    instrumentIds: [KEYS_PIANO.id],
    requiredNative: 'sample_instrument',
    minSampleRegions: 10,
  },
  {
    id: 'synth_versatile',
    label: 'Versatile Synth',
    templateId: 'virtual_instrument',
    trackType: 'software_instrument',
    instrumentIds: [SYNTH_LEAD.id, SYNTH_PAD.id, SYNTH_BASS.id],
    requiredNative: 'four_osc',
  },
  {
    id: 'drum_machine',
    label: 'Drum Machine',
    templateId: 'drum_machine',
    trackType: 'drum_machine',
    instrumentIds: [DRUM_MACHINE_INSTRUMENT.id],
    requiredNative: 'sample_kit',
    minSampleKitSlots: 8,
  },
  {
    id: 'voice_audio',
    label: 'Voice / Audio',
    templateId: 'voice_audio',
    trackType: 'voice_audio',
    instrumentIds: [VOICE_AUDIO_INSTRUMENT.id],
    requiredNative: 'native_capture',
  },
];

function roleResult(
  role: Core4QualityRole,
  validate: (checks: string[], failures: string[]) => void,
): Core4QualityResult {
  const checks: string[] = [];
  const failures: string[] = [];
  validate(checks, failures);
  return {
    roleId: role.id,
    label: role.label,
    passed: failures.length === 0,
    checks,
    failures,
  };
}

function definitionFor(
  role: Core4QualityRole,
  instrumentId: string,
  checks: string[],
  failures: string[],
): InstrumentDefinition | null {
  const definition = instrumentById(instrumentId);
  if (!definition) {
    failures.push(`${role.label}: missing instrument ${instrumentId}`);
    return null;
  }
  checks.push(`${definition.label}: catalog entry exists`);
  return definition;
}

function assignmentFor(
  role: Core4QualityRole,
  definition: InstrumentDefinition,
  presetId: string,
  checks: string[],
  failures: string[],
): NativeInstrumentAssignment | null {
  const track = createTrackFromTemplate(role.templateId, 0, {
    id: `core4-${role.id}-${definition.id}-${presetId}`,
    instrumentId: definition.id,
    presetId,
  });

  if (track.type !== role.trackType) {
    failures.push(`${role.label}: expected track type ${role.trackType}, got ${track.type}`);
  } else {
    checks.push(`${role.label}: ${definition.id} creates ${track.type} track`);
  }

  const assignment = resolveNativeInstrumentAssignment(track);
  if (role.requiredNative === 'native_capture') {
    if (assignment !== null) {
      failures.push(`${role.label}: voice capture should not assign a sample instrument`);
    } else {
      checks.push(`${role.label}: uses recording capture path instead of JS/native sample payload`);
    }
    return null;
  }

  if (!assignment) {
    failures.push(`${role.label}: ${definition.id}/${presetId} has no native assignment`);
    return null;
  }
  if (assignment.instrument !== role.requiredNative) {
    failures.push(
      `${role.label}: expected ${role.requiredNative}, got ${assignment.instrument}`,
    );
  } else {
    checks.push(`${role.label}: ${definition.id}/${presetId} resolves to ${assignment.instrument}`);
  }
  if (assignment.presetId !== presetId) {
    failures.push(`${role.label}: expected preset ${presetId}, got ${assignment.presetId}`);
  }
  return assignment;
}

function isSampleRegion(value: unknown): value is SampleInstrumentRegion {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const region = value as Partial<Record<keyof SampleInstrumentRegion, unknown>>;
  return (
    typeof region.name === 'string' &&
    typeof region.relativePath === 'string' &&
    typeof region.rootNote === 'number' &&
    typeof region.minNote === 'number' &&
    typeof region.maxNote === 'number'
  );
}

function isSampleRegions(value: unknown): value is SampleInstrumentRegion[] {
  return Array.isArray(value) && value.every(isSampleRegion);
}

function validateSampleRegions(
  role: Core4QualityRole,
  assignment: NativeInstrumentAssignment,
  checks: string[],
  failures: string[],
): void {
  const samples = assignment.params.samples;
  if (!isSampleRegions(samples)) {
    failures.push(`${role.label}: sample_instrument payload is missing playable regions`);
    return;
  }

  const minRegions = role.minSampleRegions ?? 1;
  if (samples.length < minRegions) {
    failures.push(`${role.label}: expected at least ${minRegions} regions, got ${samples.length}`);
  } else {
    checks.push(`${role.label}: ${samples.length} pitched sample regions available`);
  }

  samples.forEach(region => {
    if (!region.relativePath.trim()) {
      failures.push(`${role.label}: ${region.name} is missing a sample path`);
    }
    if (region.minNote > region.rootNote || region.rootNote > region.maxNote) {
      failures.push(`${role.label}: ${region.name} has invalid note bounds`);
    }
  });
}

function validateSampleKit(
  role: Core4QualityRole,
  assignment: NativeInstrumentAssignment,
  checks: string[],
  failures: string[],
): void {
  const samples = assignment.params.samples;
  if (!samples || Array.isArray(samples) || typeof samples !== 'object') {
    failures.push(`${role.label}: sample_kit payload is missing lane paths`);
    return;
  }

  const paths = Object.values(samples);
  const minSlots = role.minSampleKitSlots ?? 1;
  if (paths.length < minSlots) {
    failures.push(`${role.label}: expected at least ${minSlots} kit slots, got ${paths.length}`);
  } else {
    checks.push(`${role.label}: ${paths.length} drum sample lanes available`);
  }
  if (paths.some(path => typeof path !== 'string' || path.trim().length === 0)) {
    failures.push(`${role.label}: drum kit contains an empty sample path`);
  }
}

function validateFourOsc(
  role: Core4QualityRole,
  assignment: NativeInstrumentAssignment,
  presetId: string,
  checks: string[],
  failures: string[],
): void {
  if (assignment.params.preset !== presetId) {
    failures.push(`${role.label}: ${presetId} did not round-trip through params.preset`);
  } else {
    checks.push(`${role.label}: ${presetId} is JSON-addressable for native FourOsc`);
  }
}

function validateRole(role: Core4QualityRole): Core4QualityResult {
  return roleResult(role, (checks, failures) => {
    role.instrumentIds.forEach(instrumentId => {
      const definition = definitionFor(role, instrumentId, checks, failures);
      if (!definition) {
        return;
      }

      if (definition.presets.length === 0) {
        failures.push(`${role.label}: ${definition.id} has no presets`);
      }

      definition.presets.forEach(preset => {
        const assignment = assignmentFor(role, definition, preset.id, checks, failures);
        if (!assignment) {
          return;
        }
        if (assignment.instrument === 'sample_instrument') {
          validateSampleRegions(role, assignment, checks, failures);
        }
        if (assignment.instrument === 'sample_kit') {
          validateSampleKit(role, assignment, checks, failures);
        }
        if (assignment.instrument === 'four_osc') {
          validateFourOsc(role, assignment, preset.id, checks, failures);
        }
      });
    });
  });
}

export function validateCore4QualityGate(): Core4QualityGate {
  const results = CORE_4_QUALITY_ROLES.map(validateRole);
  const failures = results.flatMap(result =>
    result.failures.map(failure => `${result.roleId}: ${failure}`),
  );
  return {
    passed: failures.length === 0,
    results,
    failures,
  };
}
