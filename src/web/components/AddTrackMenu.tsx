import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import {
  rootAddTrackOptions,
  virtualInstrumentSections,
  type VirtualInstrumentPick,
} from '../../music/addTrackCatalog';
import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';
import {registerCopilotRevealHandler} from '../../assistant/copilotRevealRegistry';
import {anchoredPopupPosition} from '../../ui/anchoredPopupPosition';
import {PushableButton} from './PushableButton';

type AddTrackMenuProps = {
  onAddVirtualInstrument: (instrumentId: string, presetId: string) => void;
  onAddDrumMachine: () => void;
  onAddVoiceAudio: () => void;
};

type AddTrackMenuScreen = 'root' | 'virtual_instruments';

const PANEL_WIDTH = 280;
const PANEL_MAX_HEIGHT = 430;

export function AddTrackMenu({
  onAddVirtualInstrument,
  onAddDrumMachine,
  onAddVoiceAudio,
}: AddTrackMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [screen, setScreen] = useState<AddTrackMenuScreen>('root');
  const [anchor, setAnchor] = useState({x: 0, y: 0});
  const [position, setPosition] = useState({left: 0, top: 0});
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const revealMenu = (targetId: string): boolean => {
    if (targetId !== 'add-track-button' && !targetId.startsWith('add-track:')) {
      return false;
    }
    const rect = menuRef.current?.getBoundingClientRect();
    setAnchor({x: rect ? rect.left + rect.width / 2 : 0, y: rect ? rect.bottom : 0});
    setScreen(targetId.includes('virtual-instrument') ? 'virtual_instruments' : 'root');
    setIsOpen(true);
    return true;
  };

  useEffect(() => registerCopilotRevealHandler(revealMenu));

  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current) {
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    setPosition(anchoredPopupPosition(anchor.x, anchor.y, rect.width || PANEL_WIDTH, rect.height || PANEL_MAX_HEIGHT));
  }, [anchor.x, anchor.y, isOpen, screen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
      setScreen('root');
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setScreen('root');
  };

  const openMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchor({x: event.clientX, y: event.clientY});
    setScreen('root');
    setIsOpen(true);
  };

  const pickRoot = (optionId: string, hasSubmenu: boolean) => {
    if (optionId === 'virtual_instrument' && hasSubmenu) {
      setScreen('virtual_instruments');
      return;
    }
    if (optionId === 'drum_machine') {
      onAddDrumMachine();
      close();
      return;
    }
    if (optionId === 'voice_audio') {
      onAddVoiceAudio();
      close();
    }
  };

  const pickInstrument = (pick: VirtualInstrumentPick) => {
    onAddVirtualInstrument(pick.instrumentId, pick.presetId);
    close();
  };

  const panel = isOpen ? (
    <div
      ref={panelRef}
      className="track-menu-panel track-menu-panel-floating"
      style={{left: position.left, top: position.top, width: PANEL_WIDTH}}
      role="menu"
      aria-label="Add track menu"
      data-copilot-id="add-track:menu"
      data-copilot-label="Add track menu"
      data-copilot-purpose="Choose the kind of track to add.">
      {screen === 'root' ? (
        rootAddTrackOptions().map(option => (
          <button
            key={option.id}
            className="menu-row"
            type="button"
            data-copilot-id={`add-track:${option.id.replace(/_/g, '-')}`}
            data-copilot-label={option.label}
            data-copilot-purpose={`Open or create a ${option.label.toLowerCase()} track.`}
            onClick={() => pickRoot(option.id, option.hasSubmenu)}>
            <span>{option.label}</span>
            {option.hasSubmenu ? <span className="menu-chevron">›</span> : null}
          </button>
        ))
      ) : (
        <>
          <button className="menu-back" type="button" onClick={() => setScreen('root')}>
            ‹ Back
          </button>
          <div className="instrument-menu-scroll">
            {virtualInstrumentSections().map(section => (
              <section key={section.heading} className="instrument-section">
                <h3>{section.heading}</h3>
                {section.subcategories.map(subcategory => (
                  <div key={`${section.heading}-${subcategory.heading}`}>
                    <h4 className="instrument-subcategory">{subcategory.heading}</h4>
                    {subcategory.items.map(item => (
                      <button
                        key={`${item.instrumentId}-${item.presetId}`}
                        className="menu-row"
                        type="button"
                        data-copilot-id={`add-track:instrument:${item.instrumentId}:${item.presetId}`}
                        data-copilot-label={item.label}
                        data-copilot-purpose="Create a software instrument track with this preset."
                        onClick={() => pickInstrument(item)}>
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <div className="add-track-menu" ref={menuRef}>
      <PushableButton
        variant="green"
        copilotId="add-track-button"
        copilotLabel="+ Add track"
        copilotPurpose="Open the track type menu."
        copilotGroup="Tracks sidebar"
        guideTargetId={GUIDE_TARGET_IDS['add-track-button']}
        onClick={openMenu}>
        + Add track
      </PushableButton>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
