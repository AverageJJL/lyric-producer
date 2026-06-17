import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import type {useRecordingLaunch} from '../src/hooks/useRecordingLaunch';
import {useDAWStore} from '../src/store/useDAWStore';
import {RecordingSettingsOverlay} from '../src/web/components/RecordingSettingsOverlay';

type RecordingLaunch = ReturnType<typeof useRecordingLaunch>;

function recordingLaunch(overrides: Partial<RecordingLaunch> = {}): RecordingLaunch {
  return {
    canPunchRecord: true,
    canLoopRecord: true,
    isLeadInPending: false,
    leadInLabel: undefined,
    pendingActionLabel: 'Cancel Count-in',
    recordingCountInBeats: 4,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: -1,
    setRecordingCountInBeats: jest.fn(),
    setRecordingPreRollBeats: jest.fn(),
    setPunchRecordingEnabled: jest.fn(),
    setLoopRecordingEnabled: jest.fn(),
    setRecordingLatencyCompensationMs: jest.fn(),
    handleStartRecording: jest.fn(),
    handleStopRecording: jest.fn(),
    cancelLeadIn: jest.fn(),
    ...overrides,
  } as RecordingLaunch;
}

describe('RecordingSettingsOverlay', () => {
  beforeEach(() => {
    useDAWStore.setState({
      performanceMode: 'linear',
      looperLengthBars: 4,
    });
  });

  it('renders the selected recording settings category', () => {
    render(<RecordingSettingsOverlay recordingLaunch={recordingLaunch()} onClose={jest.fn()} />);

    expect(screen.getByRole('dialog', {name: 'Settings'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Recording Settings'})).toHaveClass('selected');
    expect(screen.getByRole('button', {name: 'Project Settings'})).not.toHaveClass('selected');
  });

  it('updates recording preferences from the overlay controls', () => {
    const launch = recordingLaunch();
    render(<RecordingSettingsOverlay recordingLaunch={launch} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Recording count-in'), {target: {value: '8'}});
    fireEvent.change(screen.getByLabelText('Recording pre-roll'), {target: {value: '4'}});
    fireEvent.change(screen.getByLabelText('Recording latency compensation'), {target: {value: '25'}});
    fireEvent.click(screen.getByLabelText('Punch recording'));

    expect(launch.setRecordingCountInBeats).toHaveBeenCalledWith(8);
    expect(launch.setRecordingPreRollBeats).toHaveBeenCalledWith(4);
    expect(launch.setRecordingLatencyCompensationMs).toHaveBeenCalledWith(25);
    expect(launch.setPunchRecordingEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText("Doesn't work yet")).toBeInTheDocument();
    expect(screen.queryByLabelText('Loop recording')).not.toBeInTheDocument();
  });

  it('updates project performance settings from the overlay', () => {
    render(<RecordingSettingsOverlay recordingLaunch={recordingLaunch()} onClose={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', {name: 'Project Settings'}));
    fireEvent.change(screen.getByLabelText('Performance mode'), {target: {value: 'looper'}});
    fireEvent.change(screen.getByLabelText('Looper length'), {target: {value: '8'}});

    expect(screen.getByRole('button', {name: 'Project Settings'})).toHaveClass('selected');
    expect(useDAWStore.getState().performanceMode).toBe('looper');
    expect(useDAWStore.getState().looperLengthBars).toBe(8);
  });
});
