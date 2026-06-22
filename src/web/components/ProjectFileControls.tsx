import React from 'react';

import type {MidiExportMode} from '../../arrangement/projectExportActions';
import {registerCopilotRevealHandler} from '../../assistant/copilotRevealRegistry';
import type {ProjectFileLifecycle} from '../../hooks/useProjectFileLifecycle';

type ProjectFileControlsProps = {
  projectFiles: ProjectFileLifecycle;
  onOpenSettings?: () => void;
};

function useCloseOnOutsideClick(
  isOpen: boolean,
  onClose: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
) {
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, isOpen, onClose]);
}

export function ProjectFileControls({
  projectFiles,
  onOpenSettings,
}: ProjectFileControlsProps) {
  const [midiMode, setMidiMode] = React.useState<MidiExportMode>('all');
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useCloseOnOutsideClick(isMenuOpen, () => setIsMenuOpen(false), menuRef);
  React.useEffect(() => registerCopilotRevealHandler(targetId => {
    if (targetId !== 'project-menu' && !targetId.startsWith('project-menu:')) {
      return false;
    }
    setIsMenuOpen(true);
    return true;
  }), []);

  const statusText = projectFiles.errorMessage
    ?? (projectFiles.isBusy
      ? projectFiles.statusMessage
      : `${projectFiles.displayName}${projectFiles.isDirty ? ' *' : ''}`);

  const run = (action: () => void | Promise<unknown>) => {
    void action();
    setIsMenuOpen(false);
  };

  return (
    <div
      className="project-file-menu"
      ref={menuRef}
      aria-label="Project file controls"
      data-copilot-group="Project file controls">
      <button
        type="button"
        className="project-menu-trigger"
        aria-label="Project menu"
        data-copilot-id="project-menu"
        data-copilot-purpose="Open project file actions such as new, open, save, import, and export."
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        onClick={() => setIsMenuOpen(open => !open)}>
        <span className="hamburger-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {isMenuOpen ? (
        <div
          className="project-menu-panel"
          role="menu"
          aria-label="Project menu"
          data-copilot-id="project-menu:panel">
          <div className="project-menu-status" title={projectFiles.statusMessage}>
            {statusText}
          </div>
          <button type="button" role="menuitem" data-copilot-id="project-menu:new" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.requestNewProject ?? projectFiles.newProject)}>
            New
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:open" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.openProject)}>
            Open
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:import-dawproject" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.importDawProject)}>
            Import DAWproject
          </button>
          <button type="button" role="menuitem" onClick={() => run(() => onOpenSettings?.())}>
            Settings
          </button>
          {projectFiles.recentProjects.length > 0 ? (
            <div className="project-menu-recent" role="group" aria-label="Recent projects">
              <span className="project-menu-recent-label">Recent</span>
              {projectFiles.recentProjects.map((path, index) => (
                <button
                  key={path}
                  type="button"
                  role="menuitem"
                  className="project-menu-recent-item"
                  data-copilot-id={`project-menu:recent:${index + 1}`}
                  disabled={projectFiles.isBusy}
                  onClick={() => run(() => projectFiles.openRecentProject(path))}>
                  {path.split(/[\\/]/).pop() ?? path}
                </button>
              ))}
            </div>
          ) : null}
          <button type="button" role="menuitem" data-copilot-id="project-menu:save" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.saveProject)}>
            Save
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:save-as" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.saveProjectAs)}>
            Save As
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:export" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.exportMixdown)}>
            Export
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:range" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.exportCycleMixdown)}>
            Range
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:clip" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.exportSelectedClip)}>
            Clip
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:stems" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.exportStems)}>
            Stems
          </button>
          <button type="button" role="menuitem" data-copilot-id="project-menu:export-dawproject" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.exportDawProject)}>
            DAWproject
          </button>
          <label className="project-menu-midi-scope">
            <span>MIDI scope</span>
            <select
              aria-label="MIDI export scope"
              data-copilot-id="project-menu:midi-scope"
              value={midiMode}
              disabled={projectFiles.isBusy}
              onChange={event => setMidiMode(event.currentTarget.value as MidiExportMode)}>
              <option value="all">All MIDI</option>
              <option value="selected">Selected</option>
              <option value="cycle">Cycle</option>
            </select>
          </label>
          <button
            type="button"
            role="menuitem"
            aria-label="MIDI"
            data-copilot-id="project-menu:midi"
            disabled={projectFiles.isBusy}
            onClick={() => run(() => projectFiles.exportMidi(midiMode))}>
            MIDI
          </button>
          {projectFiles.canCancelExport ? (
            <button type="button" role="menuitem" data-copilot-id="project-menu:cancel" onClick={() => run(projectFiles.cancelExport)}>
              Cancel
            </button>
          ) : null}
          {projectFiles.hasAutosave ? (
            <button type="button" role="menuitem" data-copilot-id="project-menu:recover" disabled={projectFiles.isBusy} onClick={() => run(projectFiles.recoverAutosave)}>
              Recover
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
