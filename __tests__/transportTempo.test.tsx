import React from 'react';
import {act, cleanup, createEvent, fireEvent, render, screen} from '@testing-library/react';

// <App/> transitively imports CopilotPanel → react-markdown (ESM); stub the markdown
// stack so jest (CommonJS transform) can parse this suite. Behaviour is unaffected.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const fetchMock = jest.fn();

function resetStore(bpm = 120): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm,
    tempoMap: [],
    meterMap: [],
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    performanceMode: 'linear',
    looperLengthBars: 4,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
  });
}

function installAudioEngineMock(): void {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {
    sendCommand,
    onEvent: () => () => undefined,
  };
}

function hasSentBpmCommand(): boolean {
  return sendCommand.mock.calls.some(([command]) => command === 'set_bpm');
}

function firePointerWithCoordinates(
  element: HTMLElement,
  event: 'pointerDown' | 'pointerMove' | 'pointerUp',
  props: {button?: number; pointerId: number; clientY: number},
): void {
  const pointerEvent = createEvent[event](element);
  Object.entries(props).forEach(([key, value]) => {
    Object.defineProperty(pointerEvent, key, {value});
  });
  fireEvent(element, pointerEvent);
}

beforeEach(() => {
  resetStore();
  installAudioEngineMock();
  fetchMock.mockResolvedValue({ok: true});
  (globalThis as unknown as {fetch: typeof fetchMock}).fetch = fetchMock;
  window.requestAnimationFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 16));
  window.cancelAnimationFrame = window.cancelAnimationFrame ?? ((id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  jest.useRealTimers();
  sendCommand.mockReset();
  fetchMock.mockReset();
});

test('commits typed tempo on Enter', () => {
  render(<App />);
  sendCommand.mockClear();

  const tempoInput = screen.getByLabelText('Tempo BPM');
  fireEvent.change(tempoInput, {target: {value: '128'}});
  fireEvent.keyDown(tempoInput, {key: 'Enter', code: 'Enter'});

  expect(tempoInput).toHaveValue('128');
  expect(useDAWStore.getState().bpm).toBe(128);
  expect(sendCommand).toHaveBeenCalledWith('set_bpm', JSON.stringify({bpm: 128}));
});

test('renders the Logic-style LCD project fields', () => {
  render(<App />);

  expect(screen.getByLabelText('Transport position')).toHaveTextContent('001');
  expect(screen.getByLabelText('Transport position')).toHaveTextContent('Bar');
  expect(screen.getByLabelText('Transport position')).toHaveTextContent('1');
  expect(screen.getByLabelText('Transport position')).toHaveTextContent('Beat');
  expect(screen.getByLabelText('Tempo BPM')).toHaveValue('120');
  expect(screen.getByText('Tempo')).toBeInTheDocument();
  // Default project key is null → show "no key" (a muted dash), never a fabricated "C Maj".
  const projectKey = screen.getByRole('button', {name: 'Project key'});
  expect(projectKey).not.toHaveTextContent('Maj');
  expect(projectKey).toHaveTextContent('—');
  expect(screen.getByLabelText('Time signature')).toHaveValue('4/4');
  expect(screen.getByLabelText('Time signature').closest('.lcd-project-column')).toContainElement(
    screen.getByRole('button', {name: 'Project key'}),
  );
  expect(screen.getByLabelText('Time signature').closest('.lcd-project-values')).not.toContainElement(
    screen.getByRole('button', {name: 'LCD options'}),
  );
  expect(screen.getByRole('button', {name: 'LCD options'}).querySelector('.fa-solid.fa-angle-down')).not.toBeNull();
  expect(screen.queryByText('Keep Tempo')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Increase tempo'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name: 'Decrease tempo'})).not.toBeInTheDocument();
});

test('reverts invalid typed tempo without committing', () => {
  render(<App />);
  sendCommand.mockClear();

  const tempoInput = screen.getByLabelText('Tempo BPM');
  fireEvent.change(tempoInput, {target: {value: 'abc'}});
  fireEvent.keyDown(tempoInput, {key: 'Enter', code: 'Enter'});

  expect(tempoInput).toHaveValue('120');
  expect(useDAWStore.getState().bpm).toBe(120);
  expect(hasSentBpmCommand()).toBe(false);
});

test('wheel updates the draft tempo and commits after a short pause', () => {
  jest.useFakeTimers();
  render(<App />);
  sendCommand.mockClear();

  const tempoInput = screen.getByLabelText('Tempo BPM');
  fireEvent.wheel(tempoInput, {deltaY: -1});

  expect(tempoInput).toHaveValue('121');
  expect(useDAWStore.getState().bpm).toBe(120);
  expect(hasSentBpmCommand()).toBe(false);

  act(() => {
    jest.advanceTimersByTime(200);
  });

  expect(useDAWStore.getState().bpm).toBe(121);
  expect(sendCommand).toHaveBeenCalledWith('set_bpm', JSON.stringify({bpm: 121}));
});

test('vertical drag updates the draft tempo and commits on release', () => {
  render(<App />);
  sendCommand.mockClear();

  const tempoInput = screen.getByLabelText('Tempo BPM') as HTMLInputElement;
  tempoInput.setPointerCapture = jest.fn();
  tempoInput.releasePointerCapture = jest.fn();

  firePointerWithCoordinates(tempoInput, 'pointerDown', {button: 0, pointerId: 1, clientY: 100});
  firePointerWithCoordinates(tempoInput, 'pointerMove', {pointerId: 1, clientY: 76});

  expect(tempoInput).toHaveValue('123');
  expect(useDAWStore.getState().bpm).toBe(120);

  firePointerWithCoordinates(tempoInput, 'pointerUp', {pointerId: 1, clientY: 76});

  expect(useDAWStore.getState().bpm).toBe(123);
  expect(sendCommand).toHaveBeenCalledWith('set_bpm', JSON.stringify({bpm: 123}));
});

test('edits the project time signature from the transport meter control', () => {
  render(<App />);

  fireEvent.change(screen.getByLabelText('Time signature'), {target: {value: '3/8'}});

  expect(useDAWStore.getState().timeSignature).toEqual({numerator: 3, denominator: 8});
  expect(useDAWStore.getState().canUndo()).toBe(true);

  act(() => {
    useDAWStore.getState().undo();
  });
  expect(useDAWStore.getState().timeSignature).toEqual({numerator: 4, denominator: 4});
});

test('edits project key metadata from the LCD key popover', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Project key'}));
  fireEvent.click(screen.getByRole('menuitemradio', {name: 'D'}));
  fireEvent.click(screen.getByRole('menuitemradio', {name: 'Minor'}));

  expect(useDAWStore.getState().scale).toEqual({root: 'D', mode: 'minor'});
  expect(screen.getByRole('button', {name: 'Project key'})).toHaveTextContent('D Min');
});

test('closes project key menu on outside pointer press', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Project key'}));
  expect(screen.getByRole('menu', {name: 'Project key menu'})).toBeInTheDocument();

  fireEvent.pointerDown(document.body);

  expect(screen.queryByRole('menu', {name: 'Project key menu'})).not.toBeInTheDocument();
});

test('keeps project key menu usable when pressing inside it', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'Project key'}));
  fireEvent.pointerDown(screen.getByRole('menu', {name: 'Project key menu'}));
  fireEvent.click(screen.getByRole('menuitemradio', {name: 'D'}));

  expect(useDAWStore.getState().scale).toEqual({root: 'D', mode: 'major'});
  expect(screen.getByRole('menu', {name: 'Project key menu'})).toBeInTheDocument();
});

test('writes and clears tempo and meter map markers at the playhead', () => {
  act(() => {
    useDAWStore.setState({playheadBeat: 8, playheadSeconds: 4});
  });
  render(<App />);

  expect(screen.queryByLabelText('Tempo map ramp')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'LCD options'}));
  fireEvent.pointerDown(screen.getByRole('menu', {name: 'Tempo and meter map'}));
  fireEvent.change(screen.getByLabelText('Tempo map ramp'), {target: {value: 'linear'}});
  fireEvent.click(screen.getByRole('menuitem', {name: 'Add tempo map marker'}));
  expect(useDAWStore.getState().tempoMap).toEqual([
    {id: 'tempo-8_000', beat: 8, bpm: 120, ramp: 'linear'},
  ]);

  fireEvent.change(screen.getByLabelText('Time signature'), {target: {value: '7/8'}});
  fireEvent.click(screen.getByRole('menuitem', {name: 'Add meter map marker'}));
  expect(useDAWStore.getState().meterMap).toEqual([
    {id: 'meter-8_000', beat: 8, timeSignature: {numerator: 7, denominator: 8}},
  ]);

  fireEvent.click(screen.getByRole('menuitem', {name: 'Clear tempo map marker'}));
  fireEvent.click(screen.getByRole('menuitem', {name: 'Clear meter map marker'}));
  expect(useDAWStore.getState().tempoMap).toEqual([]);
  expect(useDAWStore.getState().meterMap).toEqual([]);
});

test('closes tempo and meter map menu on outside pointer press or Escape', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', {name: 'LCD options'}));
  expect(screen.getByRole('menu', {name: 'Tempo and meter map'})).toBeInTheDocument();

  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu', {name: 'Tempo and meter map'})).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'LCD options'}));
  fireEvent.keyDown(document, {key: 'Escape', code: 'Escape'});

  expect(screen.queryByRole('menu', {name: 'Tempo and meter map'})).not.toBeInTheDocument();
});

test('keeps looper controls out of the transport LCD', () => {
  render(<App />);

  expect(screen.queryByRole('button', {name: 'Looper'})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Looper length')).not.toBeInTheDocument();
});

test('metronome is an icon transport button outside the LCD', () => {
  render(<App />);
  sendCommand.mockClear();

  const metronome = screen.getByRole('button', {name: 'Metronome'});
  expect(metronome.closest('.lcd-display')).toBeNull();
  expect(metronome).toHaveAttribute('aria-pressed', 'true');
  expect(metronome.querySelector('svg')).toHaveAttribute('stroke-width', '1.25');

  fireEvent.click(metronome);

  expect(metronome).toHaveAttribute('aria-pressed', 'false');
  expect(sendCommand).toHaveBeenCalledWith('set_click_track', JSON.stringify({enabled: false}));
});
