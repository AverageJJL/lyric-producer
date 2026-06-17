import React from 'react';

import {
  MASTER_OUTPUT_ID,
  normalizeTrackOutputTarget,
  normalizeTrackRoutingRole,
  normalizeTrackRoutingSends,
  normalizeTrackSidechainSource,
  type TrackRoutingRole,
} from '../../music/trackRouting';
import {useDAWStore, type DAWTrack} from '../../store/useDAWStore';

type TrackRoutingControlsProps = {
  track: DAWTrack;
  tracks: DAWTrack[];
};

type RoutingTargetOption = {
  id: string;
  label: string;
};

function stopRowSelection(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

function dbLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded} dB`;
}

function routingRoleLabel(role: TrackRoutingRole): string {
  if (role === 'bus') {
    return 'Bus';
  }
  if (role === 'aux_return') {
    return 'Aux Return';
  }
  return 'Track';
}

function routingTargetLabel(track: DAWTrack): string {
  const role = normalizeTrackRoutingRole(track.routingRole);
  const suffix = role === 'track' ? '' : ` (${routingRoleLabel(role)})`;
  return `${track.name}${suffix}`;
}

function targetOptionsForTrack(track: DAWTrack, tracks: DAWTrack[]): RoutingTargetOption[] {
  return tracks
    .filter(item => item.id !== track.id && item.isArchived !== true && item.isDisabled !== true)
    .map(item => ({id: item.id, label: routingTargetLabel(item)}));
}

export function TrackRoutingControls({track, tracks}: TrackRoutingControlsProps) {
  const setTrackRoutingRole = useDAWStore(state => state.setTrackRoutingRole);
  const setTrackOutput = useDAWStore(state => state.setTrackOutput);
  const setTrackSend = useDAWStore(state => state.setTrackSend);
  const removeTrackSend = useDAWStore(state => state.removeTrackSend);
  const setTrackSidechainSource = useDAWStore(state => state.setTrackSidechainSource);
  const targetOptions = React.useMemo(
    () => targetOptionsForTrack(track, tracks),
    [track, tracks],
  );
  const routingTracks = React.useMemo(
    () => [track, ...tracks.filter(item => targetOptions.some(option => option.id === item.id))],
    [track, tracks, targetOptions],
  );
  const routingRole = normalizeTrackRoutingRole(track.routingRole);
  const outputValue = normalizeTrackOutputTarget(track, routingTracks);
  const sidechainValue = normalizeTrackSidechainSource(track, routingTracks) ?? '';
  const sends = normalizeTrackRoutingSends(track, routingTracks);
  const targetLabel = (targetTrackId: string) =>
    targetOptions.find(option => option.id === targetTrackId)?.label ?? targetTrackId;
  const [sendTargetId, setSendTargetId] = React.useState(targetOptions[0]?.id ?? '');
  const [sendGainDb, setSendGainDb] = React.useState(-12);
  const [preFader, setPreFader] = React.useState(false);

  React.useEffect(() => {
    if (!targetOptions.some(option => option.id === sendTargetId)) {
      setSendTargetId(targetOptions[0]?.id ?? '');
    }
  }, [sendTargetId, targetOptions]);

  return (
    <div className="track-routing-controls" onClick={stopRowSelection} onPointerDown={stopRowSelection}>
      <label className="track-routing-field">
        <span>Role</span>
        <select
          aria-label={`Routing role for ${track.name}`}
          data-copilot-id={`track:${track.id}:routing-role`}
          value={routingRole}
          onChange={event =>
            setTrackRoutingRole(track.id, event.currentTarget.value as TrackRoutingRole)
          }>
          <option value="track">Track</option>
          <option value="bus">Bus</option>
          <option value="aux_return">Aux</option>
        </select>
      </label>
      <label className="track-routing-field">
        <span>Out</span>
        <select
          aria-label={`Routing output for ${track.name}`}
          data-copilot-id={`track:${track.id}:routing-output`}
          value={outputValue}
          onChange={event =>
            setTrackOutput(
              track.id,
              event.currentTarget.value === MASTER_OUTPUT_ID ? null : event.currentTarget.value,
            )
          }>
          <option value={MASTER_OUTPUT_ID}>Master</option>
          {targetOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <label className="track-routing-field">
        <span>SC</span>
        <select
          aria-label={`Sidechain source for ${track.name}`}
          data-copilot-id={`track:${track.id}:sidechain-source`}
          value={sidechainValue}
          onChange={event => setTrackSidechainSource(track.id, event.currentTarget.value || null)}>
          <option value="">None</option>
          {targetOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </label>
      <div className="track-routing-send">
        <select
          aria-label={`Routing send target for ${track.name}`}
          data-copilot-id={`track:${track.id}:send-target`}
          value={sendTargetId}
          disabled={targetOptions.length === 0}
          onChange={event => setSendTargetId(event.currentTarget.value)}>
          {targetOptions.map(option => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <input
          aria-label={`Routing send gain for ${track.name}`}
          data-copilot-id={`track:${track.id}:send-gain`}
          type="number"
          min={-60}
          max={6}
          step={0.5}
          value={sendGainDb}
          onChange={event => setSendGainDb(Number(event.currentTarget.value))}
        />
        <label className="track-routing-pre">
          <span>Pre</span>
          <input
            aria-label={`Pre-fader send for ${track.name}`}
            data-copilot-id={`track:${track.id}:send-pre-fader`}
            type="checkbox"
            checked={preFader}
            onChange={event => setPreFader(event.currentTarget.checked)}
          />
        </label>
        <button
          type="button"
          aria-label={`Set routing send for ${track.name}`}
          data-copilot-id={`track:${track.id}:set-send`}
          disabled={!sendTargetId}
          onClick={() => setTrackSend(track.id, sendTargetId, sendGainDb, preFader)}>
          Send
        </button>
      </div>
      {sends.length > 0 ? (
        <div className="track-routing-list" aria-label={`Routing sends for ${track.name}`}>
          {sends.map(send => (
            <button
              key={send.targetTrackId}
              type="button"
              aria-label={`Remove send to ${targetLabel(send.targetTrackId)} from ${track.name}`}
              onClick={() => removeTrackSend(track.id, send.targetTrackId)}>
              {targetLabel(send.targetTrackId)} {dbLabel(send.gainDb)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
