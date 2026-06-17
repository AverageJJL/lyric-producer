import React, {useRef, useState, type ComponentProps} from 'react';

import {MixerDock} from './MixerDock';

type MixerDockProps = ComponentProps<typeof MixerDock>;

const DEFAULT_HEIGHT = 300;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 560;
const COLLAPSE_THRESHOLD = 120;

export function ResizableMixerDock(props: MixerDockProps) {
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dragRef = useRef<{pointerId: number; originY: number; originHeight: number} | null>(null);

  if (isCollapsed) {
    return null;
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {pointerId: event.pointerId, originY: event.pageY, originHeight: height};
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    const next = session.originHeight + (session.originY - event.pageY);
    if (next < COLLAPSE_THRESHOLD) {
      setIsCollapsed(true);
      props.onClose();
      dragRef.current = null;
      return;
    }
    setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, next)));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resize(event);
    dragRef.current = null;
  };

  return (
    <section className="mixer-dock resizable-mixer-dock" style={{height}} aria-label="Mixer">
      <div
        className="mixer-dock-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize mixer"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
      <MixerDock {...props} />
    </section>
  );
}
