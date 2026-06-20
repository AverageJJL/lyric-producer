import React from 'react';
import {createRoot} from 'react-dom/client';

import {App} from './web/App';
import {getAppPlatform} from './native/appEnvironment';
import './web/styles/base.css';
import './web/styles/active-area.css';
import './web/styles/controls.css';
import './web/styles/transport-bar.css';
import './web/styles/timeline-zoom-sliders.css';
import './web/styles/inspector.css';
import './web/styles/mediaInspector.css';
import './web/styles/fx.css';
import './web/styles/fxHost.css';
import './web/styles/fxControls.css';
import './web/styles/cycle.css';
import './web/styles/sidebar.css';
import './web/styles/pushable-button.css';
import './web/styles/trackOrganization.css';
import './web/styles/automation.css';
import './web/styles/routing.css';
import './web/styles/meters.css';
import './web/styles/tempoMap.css';
import './web/styles/timelineMap.css';
import './web/styles/timeline.css';
import './web/styles/timelineLyrics.css';
import './web/styles/timelinePreviews.css';
import './web/styles/editor.css';
import './web/styles/piano-roll.css';
import './web/styles/piano-roll-editing.css';
import './web/styles/recording.css';
import './web/styles/assistant.css';
import './web/styles/copilot-fonts.css';
import './web/styles/copilot.css';
import './web/styles/copilot-ask.css';
import './web/styles/copilot-history.css';
import './web/styles/copilot-staging.css';
import './web/styles/copilot-markdown.css';
import './web/styles/copilot-drums.css';
import './web/styles/onboarding.css';
import './web/styles/onboarding-home.css';
import './web/styles/song-search.css';
import './web/styles/song-analyser.css';
import './web/styles/song-reference.css';
import './web/styles/structureStack.css';
import './web/styles/right-dock.css';
import './web/styles/mixer.css';
import './web/styles/workspace-nav.css';
import './web/styles/looperComp.css';
import './web/styles/density.css';
import './web/styles/trackRows.css';
import './web/styles/native-surface.css';
import './web/styles/reduced-motion.css';

const root = document.getElementById('root');
document.documentElement.dataset.platform = getAppPlatform();

if (!root) {
  throw new Error('Missing root element');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
