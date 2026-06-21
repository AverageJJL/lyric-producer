import type {ArrangementOperation} from '../arrangement/operations';
import type {ProjectSnapshot} from '../arrangement/projectSnapshot';

/**
 * A single proposed edit the user can stage into the live workspace, listen to, and
 * accept or reject (Cursor-style). Two flavors reduce to the same staging engine:
 *  - 'snapshot': a fully-compiled proposed project state (e.g. from an agent patch).
 *  - 'operations': an ArrangementOperation[] (e.g. a MIDI option import).
 * Both are applied under runWithoutHistory and reverted via snapshot restore.
 */
export type StagedEditBase = {
  id: string;
  proposalId: string;
  label: string;
  summary: string[];
};

export type StagedEdit =
  | (StagedEditBase & {kind: 'snapshot'; snapshot: ProjectSnapshot; previewSkipsNativeSync?: boolean})
  | (StagedEditBase & {kind: 'operations'; operations: ArrangementOperation[]});

/** A group of swappable options the user chooses between (only one staged at a time). */
export type StagedProposal = {
  proposalId: string;
  title: string;
  edits: StagedEdit[];
};

export function stagedEditFromSnapshot(
  base: StagedEditBase,
  snapshot: ProjectSnapshot,
  options?: {previewSkipsNativeSync?: boolean},
): StagedEdit {
  return {...base, kind: 'snapshot', snapshot, previewSkipsNativeSync: options?.previewSkipsNativeSync};
}

export function stagedEditFromOperations(
  base: StagedEditBase,
  operations: ArrangementOperation[],
): StagedEdit {
  return {...base, kind: 'operations', operations};
}
