import React, {useEffect, useMemo, useState} from 'react';

import type {AutomationMode} from '../../../automation/trackAutomation';
import type {TrackAutomationCaptureHandler} from '../../../hooks/useTrackAutomationCapture';
import {FX_SLOT_PLUGINS} from '../../../music/fxPluginMetadata';
import {useTrackFxState} from '../../../hooks/useTrackFxState';
import {normalizePluginChain, type FxSlotId, type PluginChainSlot} from '../../../native/fxContract';
import type {FxPluginScanCandidate} from '../../../native/fxPluginCatalog';
import {getFxPluginCatalog} from '../../../native/fxPluginCatalog';
import {
  addExternalPluginChainSlot,
  addPluginChainSlot,
  getFxSlot,
  getPluginParams,
  movePluginChainSlot,
  removePluginChainSlot,
} from '../../../native/fxContractOps';
import {validateFxPluginInsert} from '../../../native/fxPluginInsertValidation';
import {PluginFxEditor} from './PluginFxEditor';
import {FxSlotCard} from './FxSlotCard';
import {ExternalPluginScanPanel} from './ExternalPluginScanPanel';
import type {AiFxTarget} from '../../../orchestration/aiFxControl';

type TrackFxPanelProps = {
  trackId: string | null;
  trackName?: string;
  automationMode?: AutomationMode;
  isPlaying?: boolean;
  playheadBeat?: number;
  aiTargets?: AiFxTarget[];
  onAutomationPointCapture?: TrackAutomationCaptureHandler;
};

function slotSummary(
  state: ReturnType<typeof useTrackFxState>['state'],
  slotId: FxSlotId,
): string {
  if (!state) {
    return '—';
  }
  const slot = getFxSlot(state, slotId);
  const meta = FX_SLOT_PLUGINS[slotId];
  if (!slot.enabled) {
    return 'Bypassed';
  }
  const params = getPluginParams(state, slotId);
  const wet = params.values.dryWet;
  if (typeof wet === 'number') {
    return `${meta.displayName} · ${Math.round(wet * 100)}% wet`;
  }
  return meta.displayName;
}

function chainStatusLabel(slot: PluginChainSlot): string {
  if (slot.status === 'missing') {
    return 'Missing';
  }
  if (slot.status === 'disabled') {
    return 'Disabled';
  }
  return slot.bypassed ? 'Bypassed' : 'Ready';
}

export function TrackFxPanel({
  trackId,
  trackName,
  automationMode = 'read',
  isPlaying = false,
  playheadBeat = 0,
  aiTargets = [],
  onAutomationPointCapture,
}: TrackFxPanelProps) {
  const fx = useTrackFxState(trackId);
  const [externalInsertError, setExternalInsertError] = useState<string | null>(null);
  const catalog = useMemo(() => getFxPluginCatalog(), []);
  const trackTargets = useMemo(
    () => aiTargets.filter(target => target.trackId === trackId),
    [aiTargets, trackId],
  );

  const summaries = useMemo(
    () =>
      ({
        eq: slotSummary(fx.state, 'eq'),
        compressor: slotSummary(fx.state, 'compressor'),
        reverb: slotSummary(fx.state, 'reverb'),
      }) as Record<FxSlotId, string>,
    [fx.state],
  );

  const activeSlot = fx.activeSlot ?? 'eq';
  const activeAiTarget = trackTargets.find(target => target.slot === activeSlot);
  const firstTargetSlot = trackTargets[0]?.slot ?? null;
  const pluginChain = useMemo(
    () => (fx.state ? normalizePluginChain(fx.state) : []),
    [fx.state],
  );

  useEffect(() => {
    if (firstTargetSlot) {
      fx.setActiveSlot(firstTargetSlot);
    }
  }, [firstTargetSlot, fx.setActiveSlot]);

  useEffect(() => {
    setExternalInsertError(null);
  }, [trackId]);

  if (!trackId) {
    return (
      <section className="inspector-card fx-panel" aria-label="Track effects">
        <p className="fx-empty">Select a track to edit EQ, compressor, and reverb.</p>
      </section>
    );
  }

  const handleToggle = (slotId: FxSlotId, enabled: boolean) => {
    if (!fx.state) {
      return;
    }
    fx.commit(
      enabled
        ? addPluginChainSlot(fx.state, slotId)
        : removePluginChainSlot(fx.state, slotId),
    );
    if (enabled) {
      fx.setActiveSlot(slotId);
    }
  };

  const handleMove = (slotId: FxSlotId, direction: 'earlier' | 'later') => {
    if (!fx.state) {
      return;
    }
    fx.commit(movePluginChainSlot(fx.state, slotId, direction));
  };
  const handleAdd = (slotId: FxSlotId) => {
    if (!fx.state) {
      return;
    }
    fx.commit(addPluginChainSlot(fx.state, slotId));
    fx.setActiveSlot(slotId);
  };
  const handleRemove = (slotId: FxSlotId) => {
    if (!fx.state) {
      return;
    }
    fx.commit(removePluginChainSlot(fx.state, slotId));
  };
  const handleExternalInsert = (candidate: FxPluginScanCandidate, slotId: FxSlotId) => {
    if (!fx.state || !trackId) {
      return;
    }
    setExternalInsertError(null);
    const validation = validateFxPluginInsert(trackId, slotId, candidate);
    if (!validation.ok) {
      setExternalInsertError(validation.message);
      return;
    }
    if (!validation.canInsert) {
      setExternalInsertError(validation.recoveryHint ?? validation.reason);
      return;
    }
    fx.commit(addExternalPluginChainSlot(fx.state, slotId, validation.candidate));
    fx.setActiveSlot(slotId);
  };
  const handleParameterCommit = (slotId: FxSlotId, paramId: string) => {
    if (!trackId || !isPlaying || automationMode === 'read') {
      return;
    }
    onAutomationPointCapture?.(trackId, 'fx', `${slotId}.${paramId}`, playheadBeat);
  };

  return (
    <section className="inspector-card fx-panel" aria-label="Track effects">
      <div className="inspector-title">
        <span>FX</span>
        <strong>{trackName ?? 'Track'}</strong>
      </div>
      {fx.isLoading ? <p className="fx-status">Loading native FX…</p> : null}
      {fx.error ? <p className="fx-error" role="alert">{fx.error}</p> : null}
      {externalInsertError ? <p className="fx-error" role="alert">{externalInsertError}</p> : null}
      {fx.state ? (
        <>
          <div className="fx-chain">
            <FxSlotCard
              slotId="eq"
              title={FX_SLOT_PLUGINS.eq.displayName}
              summary={summaries.eq}
              enabled={getFxSlot(fx.state, 'eq').enabled}
              isActive={activeSlot === 'eq'}
              hasAiTarget={trackTargets.some(target => target.slot === 'eq')}
              onSelect={() => fx.setActiveSlot('eq')}
              onToggle={enabled => handleToggle('eq', enabled)}
            />
            <FxSlotCard
              slotId="compressor"
              title={FX_SLOT_PLUGINS.compressor.displayName}
              summary={summaries.compressor}
              enabled={getFxSlot(fx.state, 'compressor').enabled}
              isActive={activeSlot === 'compressor'}
              hasAiTarget={trackTargets.some(target => target.slot === 'compressor')}
              onSelect={() => fx.setActiveSlot('compressor')}
              onToggle={enabled => handleToggle('compressor', enabled)}
            />
            <FxSlotCard
              slotId="reverb"
              title={FX_SLOT_PLUGINS.reverb.displayName}
              summary={summaries.reverb}
              enabled={getFxSlot(fx.state, 'reverb').enabled}
              isActive={activeSlot === 'reverb'}
              hasAiTarget={false}
              onSelect={() => fx.setActiveSlot('reverb')}
              onToggle={enabled => handleToggle('reverb', enabled)}
            />
          </div>
          <div className="fx-catalog" aria-label={`Available FX plugins for ${trackName ?? 'Track'}`}>
            {catalog.plugins.map(plugin => {
              const slot = getFxSlot(fx.state, plugin.slot);
              return (
                <button
                  key={plugin.pluginId}
                  type="button"
                  disabled={slot.enabled || plugin.status !== 'available'}
                  onClick={() => handleAdd(plugin.slot)}>
                  <span>Add {plugin.displayName}</span>
                  <small>{plugin.format === 'builtin_airwindows' ? 'Built-in' : 'Unavailable'}</small>
                </button>
              );
            })}
          </div>
          <ExternalPluginScanPanel
            trackId={trackId}
            pluginChain={pluginChain}
            onInsert={handleExternalInsert}
          />
          <div className="fx-host-chain" aria-label={`Plugin chain for ${trackName ?? 'Track'}`}>
            {pluginChain.map((slot, index) => (
              <div
                key={slot.slot}
                className={`fx-host-slot ${slot.slot === activeSlot ? 'active' : ''}`}>
                <button
                  type="button"
                  className="fx-host-slot-main"
                  onClick={() => fx.setActiveSlot(slot.slot)}>
                  <span>{slot.displayName}</span>
                  <small>{chainStatusLabel(slot)}</small>
                </button>
                <div className="fx-host-slot-actions">
                  <button
                    type="button"
                    aria-label={`Move ${slot.displayName} earlier`}
                    disabled={index === 0}
                    onClick={() => handleMove(slot.slot, 'earlier')}>
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${slot.displayName} later`}
                    disabled={index === pluginChain.length - 1}
                    onClick={() => handleMove(slot.slot, 'later')}>
                    Down
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${slot.displayName}`}
                    disabled={!getFxSlot(fx.state, slot.slot).enabled}
                    onClick={() => handleRemove(slot.slot)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <PluginFxEditor
            slotId={activeSlot}
            state={fx.state}
            aiTarget={activeAiTarget}
            onCommit={fx.commit}
            onParamCommit={handleParameterCommit}
          />
        </>
      ) : null}
    </section>
  );
}
