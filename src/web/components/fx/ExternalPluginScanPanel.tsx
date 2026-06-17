import React, {useMemo, useState} from 'react';

import {
  scanFxPlugins,
  type FxPluginScanCandidate,
  type FxPluginScanResult,
} from '../../../native/fxPluginCatalog';
import {FX_SLOT_ORDER, type FxSlotId, type PluginChainSlot} from '../../../native/fxContract';
import {probeFxPlugin, type FxPluginProbeResult} from '../../../native/fxPluginProbe';
import {FX_SLOT_PLUGINS} from '../../../music/fxPluginMetadata';

type ExternalPluginScanPanelProps = {
  trackId?: string | null;
  pluginChain?: PluginChainSlot[];
  onInsert?: (candidate: FxPluginScanCandidate, slotId: FxSlotId) => void;
};

function formatLabel(candidate: FxPluginScanCandidate): string {
  return candidate.format === 'external_au' ? 'AU' : 'VST3';
}

function resultSummary(scan: FxPluginScanResult): string {
  const vst3 = scan.formatCounts.external_vst3;
  const au = scan.formatCounts.external_au;
  const roots = scan.scannedPaths.filter(path => path.status === 'scanned').length;
  const scope = scan.defaultPathsUsed ? 'default roots' : 'custom roots';
  return `${vst3} VST3 · ${au} AU · ${roots} ${scope}`;
}

function statusLabel(candidate: FxPluginScanCandidate): string {
  if (candidate.status === 'missing') {
    return 'Missing';
  }
  if (candidate.status === 'disabled') {
    return 'Host off';
  }
  return 'Ready';
}

function defaultInsertSlot(pluginChain: PluginChainSlot[]): FxSlotId {
  const open = pluginChain.find(slot => !slot.enabled || slot.bypassed);
  return open?.slot ?? pluginChain[0]?.slot ?? 'eq';
}

function slotLabel(pluginChain: PluginChainSlot[], slotId: FxSlotId): string {
  const chainSlot = pluginChain.find(slot => slot.slot === slotId);
  return chainSlot?.displayName || FX_SLOT_PLUGINS[slotId].displayName;
}

export function ExternalPluginScanPanel({
  trackId = null,
  pluginChain = [],
  onInsert,
}: ExternalPluginScanPanelProps = {}) {
  const [scan, setScan] = useState<FxPluginScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [probeById, setProbeById] = useState<Record<string, FxPluginProbeResult | 'probing'>>({});
  const [slotByCandidate, setSlotByCandidate] = useState<Record<string, FxSlotId>>({});
  const insertSlots = useMemo(
    () => FX_SLOT_ORDER.map(slot => ({slot, label: slotLabel(pluginChain, slot)})),
    [pluginChain],
  );

  const handleScan = () => {
    setIsScanning(true);
    try {
      setScan(scanFxPlugins());
    } finally {
      setIsScanning(false);
    }
  };

  const handleProbe = (candidate: FxPluginScanCandidate) => {
    setProbeById(previous => ({...previous, [candidate.pluginId]: 'probing'}));
    setProbeById(previous => ({...previous, [candidate.pluginId]: probeFxPlugin(candidate)}));
  };

  const candidates = scan?.candidates ?? [];
  const canOfferInsert = Boolean(trackId && onInsert);

  return (
    <div className="fx-external-scan" aria-label="External FX scan">
      <div className="fx-external-scan-header">
        <span>External</span>
        <button type="button" onClick={handleScan} disabled={isScanning}>
          {isScanning ? 'Scanning' : 'Scan'}
        </button>
      </div>
      {scan ? (
        <div className="fx-external-scan-summary">
          <span>{resultSummary(scan)}</span>
          {scan.truncated ? <strong>Limited</strong> : null}
        </div>
      ) : null}
      {scan && candidates.length === 0 ? (
        <p className="fx-external-scan-empty">No external plugins found.</p>
      ) : null}
      {candidates.length > 0 ? (
        <div className="fx-external-candidates">
          {candidates.slice(0, 6).map(candidate => (
            <div className="fx-external-candidate" key={candidate.pluginId} title={candidate.path}>
              <span>{candidate.displayName}</span>
              <small>{formatLabel(candidate)} · {statusLabel(candidate)}</small>
              <button
                type="button"
                disabled={probeById[candidate.pluginId] === 'probing'}
                onClick={() => handleProbe(candidate)}>
                {probeById[candidate.pluginId] === 'probing' ? 'Probing' : 'Probe'}
              </button>
              {probeById[candidate.pluginId] && probeById[candidate.pluginId] !== 'probing' ? (
                <small className="fx-external-probe">
                  {probeById[candidate.pluginId].ok
                    ? `${probeById[candidate.pluginId].descriptionCount} descriptions`
                    : probeById[candidate.pluginId].message}
                </small>
              ) : null}
              {canOfferInsert ? (
                <div className="fx-external-insert">
                  <select
                    aria-label={`Insert slot for ${candidate.displayName}`}
                    value={slotByCandidate[candidate.pluginId] ?? defaultInsertSlot(pluginChain)}
                    onChange={event =>
                      setSlotByCandidate(previous => ({
                        ...previous,
                        [candidate.pluginId]: event.target.value as FxSlotId,
                      }))
                    }>
                    {insertSlots.map(slot => (
                      <option key={slot.slot} value={slot.slot}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Insert ${candidate.displayName}`}
                    disabled={candidate.status !== 'available'}
                    onClick={() =>
                      onInsert?.(candidate, slotByCandidate[candidate.pluginId] ?? defaultInsertSlot(pluginChain))
                    }>
                    Insert
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
