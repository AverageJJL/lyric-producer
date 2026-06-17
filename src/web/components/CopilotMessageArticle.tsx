import React from 'react';

import type {CopilotDrumPatternOption} from '../../assistant/copilotDrumPatternOptions';
import type {CopilotMidiOption} from '../../assistant/copilotMidiOptions';
import type {CopilotChatMessage} from '../../native/copilotApi';
import {CopilotDrumPatternOptionCard} from './CopilotDrumPatternOptionCard';
import {CopilotMarkdown} from './CopilotMarkdown';
import {CopilotMidiOptionCard} from './CopilotMidiOptionCard';

export type PanelMessage = CopilotChatMessage & {
  id: string;
  error?: boolean;
  midiOptions?: CopilotMidiOption[];
  drumPatternOptions?: CopilotDrumPatternOption[];
};

type MidiController = {
  playingOptionId: string | null;
  optionStatus: Record<string, {status?: string; error?: string}>;
  playMidiOption: (option: CopilotMidiOption) => void;
  stopMidiOption: () => void;
  importMidiOption: (option: CopilotMidiOption) => void;
};

type DrumController = {
  playingOptionId: string | null;
  optionStatus: Record<string, {status?: string; error?: string}>;
  playDrumPattern: (option: CopilotDrumPatternOption) => void;
  stopDrumPattern: () => void;
  importDrumPattern: (option: CopilotDrumPatternOption) => void;
};

type CopilotMessageArticleProps = {
  message: PanelMessage;
  midiOptions: MidiController;
  drumPatterns: DrumController;
};

export function CopilotMessageArticle({
  message,
  midiOptions,
  drumPatterns,
}: CopilotMessageArticleProps) {
  const assistant = message.role === 'assistant';
  return (
    <article className={`copilot-message ${message.role === 'user' ? 'user' : 'assistant'} ${message.error ? 'error' : ''}`}>
      <span className="copilot-message-role">
        {message.role === 'user' ? 'You' : 'Copilot'}
        {assistant && message.model ? <span className="copilot-message-model">{message.model}</span> : null}
      </span>
      {assistant ? (
        <>
          <CopilotMarkdown content={message.content} />
          {message.drumPatternOptions?.length ? (
            <div className="copilot-midi-options">
              {message.drumPatternOptions.map(option => (
                <CopilotDrumPatternOptionCard
                  key={`${message.id}-${option.id}`}
                  option={option}
                  isPlaying={drumPatterns.playingOptionId === option.id}
                  status={drumPatterns.optionStatus[option.id]?.status}
                  error={drumPatterns.optionStatus[option.id]?.error}
                  onPlay={drumPatterns.playDrumPattern}
                  onStop={drumPatterns.stopDrumPattern}
                  onImport={drumPatterns.importDrumPattern}
                />
              ))}
            </div>
          ) : null}
          {message.midiOptions?.length ? (
            <div className="copilot-midi-options">
              {message.midiOptions.map(option => (
                <CopilotMidiOptionCard
                  key={`${message.id}-${option.id}`}
                  option={option}
                  isPlaying={midiOptions.playingOptionId === option.id}
                  status={midiOptions.optionStatus[option.id]?.status}
                  error={midiOptions.optionStatus[option.id]?.error}
                  onPlay={midiOptions.playMidiOption}
                  onStop={midiOptions.stopMidiOption}
                  onImport={midiOptions.importMidiOption}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="copilot-message-plain">{message.content}</p>
      )}
    </article>
  );
}
