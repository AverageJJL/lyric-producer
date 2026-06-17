import React from 'react';

import {
  PROJECT_KEY_ROOTS,
  PROJECT_SCALE_MODES,
  projectScaleLabel,
  type ScaleMetadata,
} from '../../store/projectMetadata';

type TransportProjectKeyControlProps = {
  scale: ScaleMetadata | null;
  onChange: (scale: ScaleMetadata) => void;
};

function modeLabel(mode: string): string {
  return mode === 'minor' ? 'Minor' : 'Major';
}

export function TransportProjectKeyControl({
  scale,
  onChange,
}: TransportProjectKeyControlProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const controlRef = React.useRef<HTMLDivElement>(null);
  const currentRoot = scale?.root || 'C';
  const currentMode = scale?.mode === 'minor' ? 'minor' : 'major';

  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (controlRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [isOpen]);

  const commit = (patch: Partial<ScaleMetadata>) => {
    onChange({
      root: patch.root ?? currentRoot,
      mode: patch.mode ?? currentMode,
    });
  };

  return (
    <div ref={controlRef} className="lcd-details project-key-detail">
      <button
        type="button"
        className="project-key-button"
        aria-label="Project key"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}>
        {projectScaleLabel(scale)}
      </button>
      {isOpen ? (
        <div className="project-key-menu" role="menu" aria-label="Project key menu">
          <div className="project-key-menu-grid" aria-label="Project key root">
            {PROJECT_KEY_ROOTS.map(root => (
              <button
                key={root}
                type="button"
                role="menuitemradio"
                aria-checked={root === currentRoot}
                className={root === currentRoot ? 'active' : ''}
                onClick={() => commit({root})}>
                {root}
              </button>
            ))}
          </div>
          <div className="project-key-menu-modes" aria-label="Project key scale type">
            {PROJECT_SCALE_MODES.map(mode => (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={mode === currentMode}
                className={mode === currentMode ? 'active' : ''}
                onClick={() => commit({mode})}>
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
