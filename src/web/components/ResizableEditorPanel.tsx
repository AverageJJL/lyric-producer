import React, {useRef, useState} from 'react';

const DEFAULT_HEIGHT = 360;
const MIN_HEIGHT = 120;
export const MAX_EDITOR_PANEL_HEIGHT = 560;
const COLLAPSE_THRESHOLD = 72;

type ResizableEditorPanelProps = {
  panelKey: string;
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
  bodyClassName?: string;
  initialHeight?: number;
};

export function ResizableEditorPanel({
  panelKey,
  title,
  children,
  onClose,
  bodyClassName = '',
  initialHeight = DEFAULT_HEIGHT,
}: ResizableEditorPanelProps) {
  const [height, setHeight] = useState(() =>
    Math.min(MAX_EDITOR_PANEL_HEIGHT, Math.max(MIN_HEIGHT, initialHeight)),
  );
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
      dragRef.current = null;
      return;
    }
    setHeight(Math.min(MAX_EDITOR_PANEL_HEIGHT, Math.max(MIN_HEIGHT, next)));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resize(event);
    dragRef.current = null;
  };

  const close = () => {
    if (onClose) {
      onClose();
      return;
    }
    setIsCollapsed(true);
  };

  return (
    <section
      key={panelKey}
      className="editor-panel resizable-editor-panel"
      data-shortcut-scope="editor"
      style={{height}}
      aria-label={title}>
      <div
        className="editor-panel-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${title}`}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
      <header className="editor-panel-header">
        <span>{title}</span>
        <button type="button" className="editor-panel-close" aria-label={`Close ${title}`} onClick={close}>
          ×
        </button>
      </header>
      <div className={`editor-panel-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
