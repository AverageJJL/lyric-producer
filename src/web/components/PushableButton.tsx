import React from 'react';

type PushableButtonProps = {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  copilotId?: string;
  copilotLabel?: string;
  copilotPurpose?: string;
  copilotGroup?: string;
  guideTargetId?: string;
  variant?: 'blue' | 'green';
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit';
};

/** 3D push button — nav-dark edge with accent face (Uiverse-inspired). */
export function PushableButton({
  children,
  className,
  disabled,
  copilotId,
  copilotLabel,
  copilotPurpose,
  copilotGroup,
  guideTargetId,
  variant = 'blue',
  onClick,
  type = 'button',
}: PushableButtonProps) {
  return (
    <button
      className={['pushable', `pushable-${variant}`, className].filter(Boolean).join(' ')}
      type={type}
      disabled={disabled}
      data-copilot-id={copilotId}
      data-copilot-label={copilotLabel}
      data-copilot-purpose={copilotPurpose}
      data-copilot-group={copilotGroup}
      data-guide-target={guideTargetId}
      onClick={onClick}>
      <span className="pushable-shadow" aria-hidden="true" />
      <span className="pushable-edge" aria-hidden="true" />
      <span className="pushable-front">{children}</span>
    </button>
  );
}
