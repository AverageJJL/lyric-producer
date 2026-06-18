const importedBlockDragSuppressions = new Set<string>();

export function suppressImportedBlockPointerDrag(blockId: string): void {
  importedBlockDragSuppressions.add(blockId);
}

export function shouldSuppressImportedBlockPointerDrag(blockId: string): boolean {
  return importedBlockDragSuppressions.has(blockId);
}

export function clearImportedBlockPointerDragSuppression(blockId: string): void {
  importedBlockDragSuppressions.delete(blockId);
}
