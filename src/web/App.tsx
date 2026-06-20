import React, {useEffect, useState} from 'react';

import {useProjectFileLifecycle} from '../hooks/useProjectFileLifecycle';
import {applySongIdeaAnalysis, type SongIdeaAnalysis} from '../onboarding/songIdeaAnalysis';
import {SongOnboardingPage} from './components/SongOnboardingPage';
import {DawWorkspaceApp} from './DawWorkspaceApp';

export function App() {
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false);
  const projectFiles = useProjectFileLifecycle();

  useEffect(() => {
    document.documentElement.dataset.onboarding = hasEnteredWorkspace ? 'complete' : 'active';
    return () => {
      delete document.documentElement.dataset.onboarding;
    };
  }, [hasEnteredWorkspace]);

  useEffect(() => {
    if (projectFiles.currentPath) {
      setHasEnteredWorkspace(true);
    }
  }, [projectFiles.currentPath]);

  const openEmptyProject = () => {
    setHasEnteredWorkspace(true);
  };

  const openSongIdeaProject = (analysis: SongIdeaAnalysis) => {
    applySongIdeaAnalysis(analysis);
    setHasEnteredWorkspace(true);
  };

  return (
    <>
      {/* Keep the DAW mounted behind onboarding so native sync, app menu commands,
          and project lifecycle hooks are alive before the user chooses a path. */}
      <DawWorkspaceApp projectFiles={projectFiles} />
      {!hasEnteredWorkspace ? (
        <SongOnboardingPage
          projectFiles={projectFiles}
          onOpenEmptyProject={openEmptyProject}
          onOpenSongIdeaProject={openSongIdeaProject}
        />
      ) : null}
    </>
  );
}
