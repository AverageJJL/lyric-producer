import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import type {DAWBlock} from '../src/store/useDAWStore';
import type {TimelineTrackLaneLayout} from '../src/ui/timelineTrackLanes';
import {TimelineBlock} from '../src/web/components/TimelineBlock';

const groupId = 'loop:voice:clip';

function takeBlock(id: string, index: number): DAWBlock {
  return {
    id,
    trackId: 'voice',
    name: `Take ${index + 1}`,
    startBeat: 4,
    lengthBeats: 4,
    type: 'audio',
    color: '#5588ff',
    audioFilePath: `recordings/${id}.wav`,
    absoluteAudioFilePath: `/tmp/${id}.wav`,
    recordingTakeGroupId: groupId,
    recordingTakeId: id,
    recordingTakeIndex: index,
  };
}

const folderBlock: DAWBlock = {
  ...takeBlock('comp-display', 0),
  id: `${groupId}:display`,
  name: 'Comp',
  recordingTakeGroupId: undefined,
  recordingTakeId: undefined,
  recordingTakeIndex: undefined,
  recordingCompGroupId: groupId,
  isRecordingCompDisplayBlock: true,
  recordingCompVersions: [{
    id: `${groupId}:version:a`,
    name: 'Comp A',
    segments: [],
  }],
  activeRecordingCompVersionId: `${groupId}:version:a`,
};

const trackLaneLayout: TimelineTrackLaneLayout = {
  lanes: [{trackId: 'voice', index: 0, offsetTop: 0, height: 120}],
  rowAreaHeight: 120,
  contentHeight: 180,
  maxTrackRows: 1,
};

function renderFolderHeader(overrides: Partial<React.ComponentProps<typeof TimelineBlock>> = {}) {
  return render(
    <TimelineBlock
      block={folderBlock}
      blocks={[takeBlock('take-1', 0), takeBlock('take-2', 1), folderBlock]}
      top={0}
      isSelected={false}
      isGroupSelected={false}
      trackCount={1}
      maxTimelineBeat={16}
      pixelsPerBeat={40}
      rowHeight={120}
      trackLaneLayout={trackLaneLayout}
      snapGrid="beat"
      isRelativeSnapEnabled={false}
      beatsPerBar={4}
      onMoveBlock={() => undefined}
      onResizeBlock={() => undefined}
      onSelectBlock={() => undefined}
      onUpdateBlock={() => undefined}
      onDeleteBlock={() => undefined}
      onDraggingChange={() => undefined}
      trackIds={['voice']}
      readOnly
      compVersions={folderBlock.recordingCompVersions}
      activeCompVersionId={folderBlock.activeRecordingCompVersionId}
      {...overrides}
    />,
  );
}

describe('TimelineBlock take-folder header', () => {
  it('routes menu take/version/flatten actions through the folder group id', () => {
    const onSelectCompTake = jest.fn();
    const onSwitchCompVersion = jest.fn();
    const onFlattenComp = jest.fn();
    renderFolderHeader({onSelectCompTake, onSwitchCompVersion, onFlattenComp});

    expect(screen.getByRole('button', {name: 'Take folder menu'}).querySelector('.fa-solid.fa-angle-down')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', {name: 'Take folder menu'}));
    fireEvent.click(screen.getByRole('menuitem', {name: 'Take 2'}));
    expect(onSelectCompTake).toHaveBeenCalledWith(groupId, 'take-2');

    fireEvent.click(screen.getByRole('button', {name: 'Take folder menu'}));
    fireEvent.click(screen.getByRole('menuitem', {name: 'Comp A'}));
    expect(onSwitchCompVersion).toHaveBeenCalledWith(groupId, `${groupId}:version:a`);

    fireEvent.click(screen.getByRole('button', {name: 'Take folder menu'}));
    fireEvent.click(screen.getByRole('menuitem', {name: 'Flatten and Merge'}));
    expect(onFlattenComp).toHaveBeenCalledWith(groupId);
  });

  it('uses one QS/Edit toggle button', () => {
    const onTakeFolderModeChange = jest.fn();
    const {rerender} = renderFolderHeader({
      takeFolderMode: 'quick-swipe',
      onTakeFolderModeChange,
    });

    fireEvent.click(screen.getByRole('button', {name: 'Switch to Edit'}));
    expect(onTakeFolderModeChange).toHaveBeenCalledWith(groupId, 'edit');
    expect(screen.queryByRole('button', {name: 'Edit'})).toBeNull();

    rerender(
      <TimelineBlock
        block={folderBlock}
        blocks={[takeBlock('take-1', 0), takeBlock('take-2', 1), folderBlock]}
        top={0}
        isSelected={false}
        isGroupSelected={false}
        trackCount={1}
        maxTimelineBeat={16}
        pixelsPerBeat={40}
        rowHeight={120}
        trackLaneLayout={trackLaneLayout}
        snapGrid="beat"
        isRelativeSnapEnabled={false}
        beatsPerBar={4}
        onMoveBlock={() => undefined}
        onResizeBlock={() => undefined}
        onSelectBlock={() => undefined}
        onUpdateBlock={() => undefined}
        onDeleteBlock={() => undefined}
        onDraggingChange={() => undefined}
        trackIds={['voice']}
        readOnly
        takeFolderMode="edit"
        onTakeFolderModeChange={onTakeFolderModeChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Switch to Quick Swipe'}));
    expect(onTakeFolderModeChange).toHaveBeenCalledWith(groupId, 'quick-swipe');
    expect(screen.queryByRole('button', {name: 'Quick Swipe'})).toBeNull();
  });

  it('keeps quick-swipe drags active on take lanes', () => {
    const onQuickSwipeComp = jest.fn();
    const {container} = render(
      <TimelineBlock
        block={takeBlock('take-2', 1)}
        blocks={[takeBlock('take-1', 0), takeBlock('take-2', 1), folderBlock]}
        top={0}
        isSelected={false}
        isGroupSelected={false}
        trackCount={1}
        maxTimelineBeat={16}
        pixelsPerBeat={40}
        rowHeight={120}
        trackLaneLayout={trackLaneLayout}
        snapGrid="beat"
        isRelativeSnapEnabled={false}
        beatsPerBar={4}
        onMoveBlock={() => undefined}
        onResizeBlock={() => undefined}
        onSelectBlock={() => undefined}
        onUpdateBlock={() => undefined}
        onDeleteBlock={() => undefined}
        onDraggingChange={() => undefined}
        trackIds={['voice']}
        readOnly
        quickSwipeMode
        onQuickSwipeComp={onQuickSwipeComp}
      />,
    );
    const body = container.querySelector('.timeline-block-clip-surface, .block-body') as HTMLElement;
    const block = container.querySelector('.timeline-block') as HTMLElement;
    block.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 160,
      bottom: 100,
      width: 160,
      height: 100,
      toJSON: () => undefined,
    });
    body.setPointerCapture = () => undefined;

    fireEvent.pointerDown(body, {clientX: 40, pointerId: 1});
    fireEvent.pointerUp(body, {clientX: 120, pointerId: 1});

    expect(onQuickSwipeComp).toHaveBeenCalledWith(
      expect.objectContaining({recordingTakeId: 'take-2'}),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
