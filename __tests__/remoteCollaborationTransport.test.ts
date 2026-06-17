import {createPresence} from '../src/collaboration/collaborationRoom';
import {createCollaborationOperation, createCollaborationSignal} from '../src/collaboration/collaborationTransport';
import {
  createRemoteCollaborationTransport,
  type RemoteCollaborationTransport,
} from '../src/collaboration/remoteCollaborationTransport';

type FakeSocket = {
  readyState: number;
  url: string;
  sent: string[];
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((event: {data: unknown}) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

function createFakeSocket(url: string): FakeSocket {
  return {
    readyState: 0,
    url,
    sent: [],
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send(data: string) {
      this.sent.push(data);
    },
    close() {
      this.readyState = 3;
      this.onclose?.();
    },
  };
}

describe('remote collaboration transport', () => {
  let socket: FakeSocket;
  let sockets: FakeSocket[];
  let transport: RemoteCollaborationTransport;
  const statuses: string[] = [];
  const errors: string[] = [];
  const signals: unknown[] = [];

  beforeEach(() => {
    sockets = [];
    statuses.length = 0;
    errors.length = 0;
    signals.length = 0;
    transport = createRemoteCollaborationTransport({
      endpoint: 'wss://studio.example/ws',
      roomId: 'dark-room',
      peerId: 'peer-1',
      token: 'secret',
      createSocket: url => {
        socket = createFakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      onPresence: jest.fn(),
      onOperation: jest.fn(),
      onSignal: signal => signals.push(signal),
      onStatus: status => statuses.push(status),
      onError: error => errors.push(error),
    });
  });

  it('connects with room identity and sends typed wire messages after open', () => {
    const presence = createPresence({
      peerId: 'peer-1',
      displayName: 'Producer',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 0,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });

    expect(socket.url).toBe('wss://studio.example/ws?room=dark-room&peer=peer-1&token=secret');
    expect(transport.sendPresence(presence)).toBe(false);

    socket.readyState = 1;
    socket.onopen?.();

    expect(transport.sendPresence(presence)).toBe(true);
    expect(statuses).toEqual(['connecting', 'connected']);
    expect(errors).toEqual(['Remote collaboration service is not connected.']);
    expect(JSON.parse(socket.sent[0]!)).toEqual({type: 'presence', presence});
  });

  it('sends operation envelopes without mutating their payloads', () => {
    const operation = createCollaborationOperation({
      peerId: 'peer-1',
      roomId: 'dark-room',
      clientSeq: 1,
      clock: 1,
      now: 1000,
      targetType: 'track',
      targetId: 'track-1',
      action: 'rename',
      conflictKey: 'track:track-1:name',
      payload: {name: 'Lead'},
    });
    socket.readyState = 1;

    expect(transport.sendOperation(operation)).toBe(true);
    expect(JSON.parse(socket.sent[0]!)).toEqual({type: 'operation', operation});
  });

  it('sends and receives WebRTC signaling envelopes', () => {
    const signal = createCollaborationSignal({
      roomId: 'dark-room',
      fromPeerId: 'peer-1',
      toPeerId: 'peer-2',
      kind: 'offer',
      payload: {sdp: 'v=0'},
      now: 1000,
    });
    socket.readyState = 1;

    expect(transport.sendSignal(signal)).toBe(true);
    expect(JSON.parse(socket.sent[0]!)).toEqual({type: 'signal', signal});

    socket.onmessage?.({data: JSON.stringify({type: 'signal', signal})});
    expect(signals).toEqual([signal]);
  });

  it('hydrates room-state snapshots through presence and operation callbacks', () => {
    const onPresence = jest.fn();
    const onOperation = jest.fn();
    transport.close();
    transport = createRemoteCollaborationTransport({
      endpoint: 'wss://studio.example/ws',
      roomId: 'dark-room',
      peerId: 'peer-1',
      createSocket: url => {
        socket = createFakeSocket(url);
        return socket;
      },
      onPresence,
      onOperation,
      onStatus: jest.fn(),
      onError: jest.fn(),
    });
    const presence = createPresence({
      peerId: 'peer-2',
      displayName: 'Remote',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 4,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });
    const operation = createCollaborationOperation({
      peerId: 'peer-2',
      roomId: 'dark-room',
      clientSeq: 1,
      clock: 1,
      now: 1000,
      targetType: 'track',
      targetId: 'track-1',
      action: 'rename',
      conflictKey: 'track:track-1:name',
      payload: {name: 'Lead'},
    });

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'room_state',
        snapshot: {roomId: 'dark-room', peerIds: ['peer-2'], presences: [presence], operations: [operation]},
      }),
    });

    expect(onPresence).toHaveBeenCalledWith(presence);
    expect(onOperation).toHaveBeenCalledWith(operation);
  });

  it('reconnects after a remote close and replays latest presence', () => {
    const scheduled: Array<{delayMs: number; callback: () => void}> = [];
    const presence = createPresence({
      peerId: 'peer-1',
      displayName: 'Producer',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 12,
      selectedTrackId: 'track-1',
      selectedBlockId: null,
      now: 1000,
    });
    transport.close();
    statuses.length = 0;
    errors.length = 0;
    sockets = [];

    transport = createRemoteCollaborationTransport({
      endpoint: 'wss://studio.example/ws',
      roomId: 'dark-room',
      peerId: 'peer-1',
      token: 'secret',
      reconnect: {
        baseDelayMs: 100,
        maxDelayMs: 500,
        schedule: (callback, delayMs) => {
          scheduled.push({callback, delayMs});
          return callback;
        },
        clearSchedule: jest.fn(),
      },
      createSocket: url => {
        const created = createFakeSocket(url);
        sockets.push(created);
        return created;
      },
      onPresence: jest.fn(),
      onOperation: jest.fn(),
      onStatus: status => statuses.push(status),
      onError: error => errors.push(error),
    });

    sockets[0]!.readyState = 1;
    sockets[0]!.onopen?.();
    expect(transport.sendPresence(presence)).toBe(true);

    sockets[0]!.readyState = 3;
    sockets[0]!.onclose?.();

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.delayMs).toBe(100);
    scheduled[0]!.callback();
    sockets[1]!.readyState = 1;
    sockets[1]!.onopen?.();

    expect(JSON.parse(sockets[1]!.sent[0]!)).toEqual({type: 'presence', presence});
    expect(statuses).toEqual(['connecting', 'connected', 'connecting', 'connecting', 'connected']);
    expect(errors).toEqual([]);
  });

  it('does not reconnect after a manual close', () => {
    const clearSchedule = jest.fn();
    const scheduled: Array<() => void> = [];
    transport.close();
    statuses.length = 0;
    sockets = [];

    transport = createRemoteCollaborationTransport({
      endpoint: 'wss://studio.example/ws',
      roomId: 'dark-room',
      peerId: 'peer-1',
      reconnect: {
        schedule: callback => {
          scheduled.push(callback);
          return callback;
        },
        clearSchedule,
      },
      createSocket: url => {
        const created = createFakeSocket(url);
        sockets.push(created);
        return created;
      },
      onPresence: jest.fn(),
      onOperation: jest.fn(),
      onStatus: status => statuses.push(status),
      onError: error => errors.push(error),
    });

    sockets[0]!.onclose?.();
    expect(scheduled).toHaveLength(1);

    transport.close();

    expect(clearSchedule).toHaveBeenCalledWith(scheduled[0]);
    expect(statuses.at(-1)).toBe('idle');
  });
});
