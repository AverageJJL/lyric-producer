/** Public surface of the folder-based `.apc` source format. */
export * from './apcSourceTypes';
export {decomposeSnapshotToApcSource, serializeApcSource} from './apcDecompose';
export {parseApcSourceFiles, type ApcParseResult} from './apcParse';
export {compileApcSourceToSnapshot} from './apcCompile';
export {
  saveCurrentApcProject,
  openApcProject,
  createNewApcProject,
  restoreApcProjectFromFiles,
  currentSourceFiles,
  type ApcProjectActionResult,
  type SaveApcProjectOptions,
} from './apcProjectActions';
export {
  validateApcSource,
  isFatalApcIssue,
  apcRelativePathIsSafe,
} from './apcValidation';
