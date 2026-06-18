import React from 'react';

type IconProps = {
  className?: string;
};

export function SamplesWaveformIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="currentColor">
        <rect x="17" y="52" width="6" height="16" rx="3" />
        <rect x="33" y="35" width="6" height="50" rx="3" />
        <rect x="49" y="15" width="6" height="90" rx="3" />
        <rect x="65" y="40" width="6" height="40" rx="3" />
        <rect x="81" y="27" width="6" height="66" rx="3" />
        <rect x="97" y="52" width="6" height="16" rx="3" />
      </g>
    </svg>
  );
}

export function BrowserFolderIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AudioSpeakerIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4.5"
        y="2"
        width="15"
        height="20"
        rx="3.5"
        ry="3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
      />
      <circle cx="12" cy="7.5" r="1.75" fill="currentColor" />
      <circle cx="12" cy="15" r="3.25" fill="none" stroke="currentColor" strokeWidth="2.25" />
    </svg>
  );
}

export function MixerSlidersIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <mask id="mixer-icon-cutout">
          <rect width="100%" height="100%" fill="white" />
          <circle cx="17" cy="65" r="5.5" fill="black" />
          <circle cx="50" cy="35" r="5.5" fill="black" />
          <circle cx="83" cy="65" r="5.5" fill="black" />
        </mask>
      </defs>
      <g fill="currentColor" mask="url(#mixer-icon-cutout)">
        <rect x="14" y="15" width="6" height="70" />
        <circle cx="17" cy="65" r="15" />
        <rect x="47" y="15" width="6" height="70" />
        <circle cx="50" cy="35" r="15" />
        <rect x="80" y="15" width="6" height="70" />
        <circle cx="83" cy="65" r="15" />
      </g>
    </svg>
  );
}

export function CopilotSparkIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3l1.9 5.2L19 10.1l-5.1 1.8L12 17l-1.9-5.1L5 10.1l5.1-1.9L12 3z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z"
        fill="currentColor"
      />
      <circle cx="6.5" cy="17.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function SendHorizontalIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="currentColor" />
    </svg>
  );
}

export function MicrophoneIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a4 4 0 0 0-4 4v5a4 4 0 0 0 8 0V7a4 4 0 0 0-4-4z" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V22M8.5 22h7" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

export function SettingsSlidersIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <circle cx="9" cy="7" r="2" fill="currentColor" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <circle cx="11" cy="17" r="2" fill="currentColor" />
    </svg>
  );
}

export function CloseSmallIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function PlayTriangleIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

export function StopSquareIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function ImportArrowIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11m0 0l-4-4m4 4l4-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 19h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function PlusIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function ClockHistoryIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

export function ChevronDownIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function CheckIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function RefreshGuideIcon({className}: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19 8.5A7 7 0 0 0 7.2 5.9L5 8.1V4h4.1L8 5.1A5.4 5.4 0 0 1 17.4 8.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path
        d="M5 15.5a7 7 0 0 0 11.8 2.6l2.2-2.2V20h-4.1l1.1-1.1A5.4 5.4 0 0 1 6.6 15.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}
