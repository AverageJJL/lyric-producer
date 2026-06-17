import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {
  collaborationPeerList,
  createPresence,
  emptyCollaborationRoom,
  peerColor,
  pruneStalePeers,
  sanitizeCollaborationRoomId,
  sanitizePeerName,
  upsertPeerPresence,
  type CollaborationPresence,
  type CollaborationRoomState,
} from '../collaboration/collaborationRoom';
import {
  resolveCollaborationConflicts,
  sanitizeRemoteEndpoint,
  type CollaborationOperation,
  type CollaborationTransportMode,
  type CollaborationTransportStatus,
} from '../collaboration/collaborationTransport';
import {
  createRemoteCollaborationTransport,
  type RemoteCollaborationTransport,
} from '../collaboration/remoteCollaborationTransport';
import {useDAWStore} from '../store/useDAWStore';

const CHANNEL_NAME = 'musicapp-collaboration-presence';
const PRESENCE_INTERVAL_MS = 2_000;

export type CollaborationRoomControls = {
  isSupported: boolean;
  isEnabled: boolean;
  transportMode: CollaborationTransportMode;
  transportStatus: CollaborationTransportStatus;
  transportError: string | null;
  roomId: string;
  peerName: string;
  remoteEndpoint: string;
  remoteAuthToken: string;
  selfColor: string;
  peers: CollaborationPresence[];
  operations: CollaborationOperation[];
  setEnabled: (enabled: boolean) => void;
  setTransportMode: (mode: CollaborationTransportMode) => void;
  setRoomId: (roomId: string) => void;
  setPeerName: (peerName: string) => void;
  setRemoteEndpoint: (endpoint: string) => void;
  setRemoteAuthToken: (token: string) => void;
};

function createPeerId(): string {
  return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useCollaborationRoom(): CollaborationRoomControls {
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const selectedTrackId = useDAWStore(state => state.selectedTrackId);
  const selectedBlockId = useDAWStore(state => state.selectedBlockId);
  const isLocalSupported = typeof globalThis.BroadcastChannel !== 'undefined';
  const isRemoteSupported = typeof globalThis.WebSocket !== 'undefined';
  const peerIdRef = useRef(createPeerId());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const remoteTransportRef = useRef<RemoteCollaborationTransport | null>(null);
  const [isEnabled, setEnabled] = useState(false);
  const [transportMode, setTransportModeState] = useState<CollaborationTransportMode>('local');
  const [transportStatus, setTransportStatus] = useState<CollaborationTransportStatus>('idle');
  const [transportError, setTransportError] = useState<string | null>(null);
  const [roomId, setRoomIdState] = useState('local-studio');
  const [peerName, setPeerName] = useState('Producer');
  const [remoteEndpoint, setRemoteEndpoint] = useState('');
  const [remoteAuthToken, setRemoteAuthToken] = useState('');
  const [operations, setOperations] = useState<CollaborationOperation[]>([]);
  const [roomState, setRoomState] = useState<CollaborationRoomState>(() =>
    emptyCollaborationRoom(roomId, peerIdRef.current),
  );
  const selfColor = peerColor(peerIdRef.current);
  const latestPresenceRef = useRef<CollaborationPresence | null>(null);
  const isSupported = transportMode === 'remote' ? isRemoteSupported : isLocalSupported;

  const presence = useMemo(() => createPresence({
    peerId: peerIdRef.current,
    displayName: peerName,
    color: selfColor,
    roomId,
    playheadBeat,
    selectedTrackId,
    selectedBlockId,
    now: Date.now(),
  }), [peerName, playheadBeat, roomId, selectedBlockId, selectedTrackId, selfColor]);

  useEffect(() => {
    latestPresenceRef.current = presence;
    if (isEnabled && transportMode === 'local') {
      channelRef.current?.postMessage({type: 'presence', presence});
    }
    if (isEnabled && transportMode === 'remote' && transportStatus === 'connected') {
      remoteTransportRef.current?.sendPresence(presence);
    }
  }, [isEnabled, presence, transportMode, transportStatus]);

  useEffect(() => {
    setRoomState(emptyCollaborationRoom(roomId, peerIdRef.current));
    setOperations([]);
  }, [roomId]);

  useEffect(() => {
    if (!isEnabled || transportMode !== 'local' || !isLocalSupported) {
      return undefined;
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.onmessage = event => {
      const message = event.data as {type?: string; presence?: CollaborationPresence};
      if (message.type === 'presence' && message.presence) {
        setRoomState(state => upsertPeerPresence(state, message.presence!));
      }
    };

    const publish = () => {
      const latestPresence = latestPresenceRef.current;
      if (latestPresence) {
        channel.postMessage({type: 'presence', presence: latestPresence});
      }
      setRoomState(state => pruneStalePeers(state, Date.now()));
    };
    publish();
    const interval = window.setInterval(publish, PRESENCE_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
      channel.close();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [isEnabled, isLocalSupported, roomId, transportMode]);

  useEffect(() => {
    if (!isEnabled || transportMode !== 'remote') {
      return undefined;
    }
    const endpoint = sanitizeRemoteEndpoint(remoteEndpoint);
    if (!isRemoteSupported || !endpoint) {
      setTransportStatus('error');
      setTransportError('Remote collaboration needs a ws:// or wss:// service endpoint.');
      return undefined;
    }

    setTransportError(null);
    let transport: RemoteCollaborationTransport;
    try {
      transport = createRemoteCollaborationTransport({
        endpoint,
        roomId,
        peerId: peerIdRef.current,
        token: remoteAuthToken,
        onPresence: remotePresence => {
          setRoomState(state => upsertPeerPresence(state, remotePresence));
        },
        onOperation: operation => {
          setOperations(current =>
            resolveCollaborationConflicts([...current, operation]).accepted,
          );
        },
        onStatus: setTransportStatus,
        onError: setTransportError,
      });
    } catch (error) {
      setTransportStatus('error');
      setTransportError(error instanceof Error ? error.message : 'Remote collaboration failed.');
      return undefined;
    }
    remoteTransportRef.current = transport;

    return () => {
      transport.close();
      if (remoteTransportRef.current === transport) {
        remoteTransportRef.current = null;
      }
    };
  }, [
    isEnabled,
    isRemoteSupported,
    remoteAuthToken,
    remoteEndpoint,
    roomId,
    transportMode,
  ]);

  const setRoomId = useCallback((nextRoomId: string) => {
    setRoomIdState(sanitizeCollaborationRoomId(nextRoomId));
  }, []);

  const setCleanPeerName = useCallback((nextPeerName: string) => {
    setPeerName(sanitizePeerName(nextPeerName));
  }, []);

  const setTransportMode = useCallback((nextMode: CollaborationTransportMode) => {
    setTransportModeState(nextMode);
    setEnabled(false);
    setTransportStatus('idle');
    setTransportError(null);
  }, []);

  return {
    isSupported,
    isEnabled,
    transportMode,
    transportStatus,
    transportError,
    roomId,
    peerName,
    remoteEndpoint,
    remoteAuthToken,
    selfColor,
    peers: collaborationPeerList(roomState),
    operations,
    setEnabled,
    setTransportMode,
    setRoomId,
    setPeerName: setCleanPeerName,
    setRemoteEndpoint,
    setRemoteAuthToken,
  };
}
