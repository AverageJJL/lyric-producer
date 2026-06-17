import type {CollaborationPresence} from './collaborationRoom';
import {
  collaborationServiceUrl,
  parseCollaborationWireMessage,
  serializeCollaborationWireMessage,
  type CollaborationOperation,
  type CollaborationSignal,
  type CollaborationTransportStatus,
} from './collaborationTransport';

type RemoteSocketMessageEvent = {data: unknown};
type RemoteSocket = {
  readyState: number;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: RemoteSocketMessageEvent) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type RemoteReconnectOptions = {
  enabled?: boolean;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  clearSchedule?: (handle: unknown) => void;
};

type RemoteCollaborationTransportOptions = {
  endpoint: string;
  roomId: string;
  peerId: string;
  token?: string;
  reconnect?: RemoteReconnectOptions;
  createSocket?: (url: string) => RemoteSocket;
  onPresence: (presence: CollaborationPresence) => void;
  onOperation: (operation: CollaborationOperation) => void;
  onSignal?: (signal: CollaborationSignal) => void;
  onStatus: (status: CollaborationTransportStatus) => void;
  onError: (message: string) => void;
};

export type RemoteCollaborationTransport = {
  url: string;
  sendPresence: (presence: CollaborationPresence) => boolean;
  sendOperation: (operation: CollaborationOperation) => boolean;
  sendSignal: (signal: CollaborationSignal) => boolean;
  close: () => void;
};

const SOCKET_OPEN = 1;
const DEFAULT_RECONNECT_BASE_MS = 500;
const DEFAULT_RECONNECT_MAX_MS = 5_000;
const DEFAULT_RECONNECT_ATTEMPTS = 8;

function defaultCreateSocket(url: string): RemoteSocket {
  if (typeof globalThis.WebSocket === 'undefined') {
    throw new Error('WebSocket is not available in this environment.');
  }
  return new WebSocket(url) as unknown as RemoteSocket;
}

export function createRemoteCollaborationTransport(
  options: RemoteCollaborationTransportOptions,
): RemoteCollaborationTransport {
  const url = collaborationServiceUrl(
    options.endpoint,
    options.roomId,
    options.peerId,
    options.token,
  );
  if (!url) {
    throw new Error('Remote collaboration requires a ws:// or wss:// service endpoint.');
  }

  const reconnect = options.reconnect ?? {};
  const reconnectEnabled = reconnect.enabled ?? true;
  const maxAttempts = Math.max(0, reconnect.maxAttempts ?? DEFAULT_RECONNECT_ATTEMPTS);
  const baseDelayMs = Math.max(0, reconnect.baseDelayMs ?? DEFAULT_RECONNECT_BASE_MS);
  const maxDelayMs = Math.max(baseDelayMs, reconnect.maxDelayMs ?? DEFAULT_RECONNECT_MAX_MS);
  const schedule = reconnect.schedule ?? ((callback: () => void, delayMs: number) =>
    globalThis.setTimeout(callback, delayMs));
  const clearSchedule = reconnect.clearSchedule ?? (handle => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  });
  const createSocket = options.createSocket ?? defaultCreateSocket;
  let socket: RemoteSocket | null = null;
  let reconnectHandle: unknown = null;
  let reconnectAttempts = 0;
  let isClosedByClient = false;
  let latestPresence: CollaborationPresence | null = null;

  const write = (message: Parameters<typeof serializeCollaborationWireMessage>[0]): boolean => {
    if (socket?.readyState !== SOCKET_OPEN) {
      options.onError('Remote collaboration service is not connected.');
      return false;
    }
    socket.send(serializeCollaborationWireMessage(message));
    return true;
  };

  const clearReconnect = () => {
    if (reconnectHandle !== null) {
      clearSchedule(reconnectHandle);
      reconnectHandle = null;
    }
  };

  const reconnectDelay = (attempt: number): number =>
    Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));

  const connect = () => {
    clearReconnect();
    options.onStatus('connecting');
    const nextSocket = createSocket(url);
    socket = nextSocket;

    nextSocket.onopen = () => {
      reconnectAttempts = 0;
      options.onStatus('connected');
      if (latestPresence) {
        write({type: 'presence', presence: latestPresence});
      }
    };
    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
      }
      if (isClosedByClient) {
        options.onStatus('idle');
        return;
      }
      if (!reconnectEnabled || reconnectAttempts >= maxAttempts) {
        options.onStatus('error');
        options.onError('Remote collaboration service disconnected.');
        return;
      }
      reconnectAttempts += 1;
      options.onStatus('connecting');
      reconnectHandle = schedule(connect, reconnectDelay(reconnectAttempts));
    };
    nextSocket.onerror = () => {
      options.onStatus('error');
      options.onError('Remote collaboration service connection failed.');
    };
    nextSocket.onmessage = event => {
      const message = parseCollaborationWireMessage(event.data);
      if (message?.type === 'presence') {
        options.onPresence(message.presence);
      }
      if (message?.type === 'operation') {
        options.onOperation(message.operation);
      }
      if (message?.type === 'signal') {
        options.onSignal?.(message.signal);
      }
      if (message?.type === 'room_state') {
        message.snapshot.presences.forEach(presence => options.onPresence(presence));
        message.snapshot.operations.forEach(operation => options.onOperation(operation));
      }
    };
  };

  connect();

  const close = () => {
    isClosedByClient = true;
    clearReconnect();
    const currentSocket = socket;
    socket = null;
    if (currentSocket) {
      currentSocket.onclose = null;
      currentSocket.close();
    }
    options.onStatus('idle');
  };

  return {
    url,
    sendPresence: presence => {
      latestPresence = presence;
      return write({type: 'presence', presence});
    },
    sendOperation: operation => write({type: 'operation', operation}),
    sendSignal: signal => write({type: 'signal', signal}),
    close,
  };
}
