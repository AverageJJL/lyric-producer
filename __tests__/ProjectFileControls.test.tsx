import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import type {ProjectFileLifecycle} from '../src/hooks/useProjectFileLifecycle';
import {ProjectFileControls} from '../src/web/components/ProjectFileControls';

function lifecycle(overrides: Partial<ProjectFileLifecycle> = {}): ProjectFileLifecycle {
  return {
    currentPath: null,
    displayName: 'Untitled',
    isDirty: false,
    isBusy: false,
    hasAutosave: false,
    recentProjects: [],
    statusMessage: 'Unsaved project',
    errorMessage: null,
    newProject: jest.fn(),
    openProject: jest.fn(),
    openRecentProject: jest.fn(),
    importDawProject: jest.fn(),
    importDawProjectPath: jest.fn(),
    saveProject: jest.fn(),
    saveProjectAs: jest.fn(),
    exportMixdown: jest.fn(),
    exportCycleMixdown: jest.fn(),
    exportSelectedClip: jest.fn(),
    exportStems: jest.fn(),
    exportMidi: jest.fn(),
    exportDawProject: jest.fn(),
    cancelExport: jest.fn(),
    canCancelExport: false,
    recoverAutosave: jest.fn(),
    ...overrides,
  };
}

function openProjectMenu() {
  fireEvent.click(screen.getByRole('button', {name: 'Project menu'}));
}

function renderProjectFileControls(projectFiles: ProjectFileLifecycle) {
  return render(<ProjectFileControls projectFiles={projectFiles} onClearGuide={jest.fn()} />);
}

describe('ProjectFileControls MIDI export scope', () => {
  it('shows the active busy status message', () => {
    renderProjectFileControls(lifecycle({
      isBusy: true,
      statusMessage: 'Rendering stem 1/2: Lead',
    }));
    openProjectMenu();

    expect(screen.getByText('Rendering stem 1/2: Lead')).toBeInTheDocument();
  });

  it('exports all MIDI by default', () => {
    const exportMidi = jest.fn();
    renderProjectFileControls(lifecycle({exportMidi}));
    openProjectMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'MIDI'}));

    expect(exportMidi).toHaveBeenCalledWith('all');
  });

  it('runs DAWproject import and export actions', () => {
    const importDawProject = jest.fn();
    const exportDawProject = jest.fn();
    renderProjectFileControls(lifecycle({
      exportDawProject,
      importDawProject,
    }));
    openProjectMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'Import DAWproject'}));
    openProjectMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'DAWproject'}));

    expect(importDawProject).toHaveBeenCalledTimes(1);
    expect(exportDawProject).toHaveBeenCalledTimes(1);
  });

  it('opens settings from the project menu', () => {
    const onOpenSettings = jest.fn();
    render(<ProjectFileControls projectFiles={lifecycle()} onOpenSettings={onOpenSettings} onClearGuide={jest.fn()} />);
    openProjectMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'Settings'}));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('routes New through the project chooser when provided', () => {
    const newProject = jest.fn();
    const requestNewProject = jest.fn();
    renderProjectFileControls(lifecycle({newProject, requestNewProject}));
    openProjectMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'New'}));

    expect(requestNewProject).toHaveBeenCalledTimes(1);
    expect(newProject).not.toHaveBeenCalled();
  });

  it('closes the project menu from an outside pointer press', () => {
    render(
      <div>
        <ProjectFileControls projectFiles={lifecycle()} onClearGuide={jest.fn()} />
        <button type="button">Outside</button>
      </div>,
    );
    openProjectMenu();

    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', {name: 'Outside'}));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows export cancellation while cancellable exports are active', () => {
    const cancelExport = jest.fn();
    renderProjectFileControls(lifecycle({
      isBusy: true,
      canCancelExport: true,
      cancelExport,
    }));
    openProjectMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'Cancel'}));

    expect(cancelExport).toHaveBeenCalledTimes(1);
  });

  it('passes the selected MIDI export scope', () => {
    const exportMidi = jest.fn();
    renderProjectFileControls(lifecycle({exportMidi}));
    openProjectMenu();
    fireEvent.change(screen.getByLabelText('MIDI export scope'), {
      target: {value: 'selected'},
    });
    fireEvent.click(screen.getByRole('menuitem', {name: 'MIDI'}));

    expect(exportMidi).toHaveBeenCalledWith('selected');
  });
});
