import React from 'react';
import {createRoot} from 'react-dom/client';

import {FxWindowApp} from './web/FxWindowApp';
import './web/styles/base.css';
import './web/styles/controls.css';
import './web/styles/fx.css';
import './web/styles/fxHost.css';
import './web/styles/fxControls.css';
import './web/styles/inspector.css';
import './web/styles/fx-window.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing root element');
}

createRoot(root).render(
  <React.StrictMode>
    <FxWindowApp />
  </React.StrictMode>,
);
