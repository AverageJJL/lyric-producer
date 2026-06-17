import React, {useEffect, useMemo} from 'react';

import {useFxSlotDraft} from '../../../hooks/useFxSlotDraft';
import {
  FX_SLOT_PARAM_GROUPS,
  FX_SLOT_PLUGINS,
  type FxParamMeta,
} from '../../../music/fxPluginMetadata';
import type {FxSlotId, TrackFxState} from '../../../native/fxContract';
import type {AiFxTarget} from '../../../orchestration/aiFxControl';
import {FxParamControl} from './FxParamControl';

type PluginFxEditorProps = {
  slotId: FxSlotId;
  state: TrackFxState;
  onCommit: (next: TrackFxState) => void;
  onParamCommit?: (slotId: FxSlotId, paramId: string) => void;
  aiTarget?: AiFxTarget;
};

function formatParamValue(paramId: string, value: number): string {
  if (paramId === 'dryWet') {
    return `${Math.round(value * 100)}%`;
  }
  return `${Math.round(value * 1000) / 10}%`;
}

function ParamKnob({
  param,
  value,
  isAiTargeted,
  onDraftChange,
  onCommit,
  onParamCommit,
}: {
  param: FxParamMeta;
  value: number;
  isAiTargeted: boolean;
  onDraftChange: (value: number) => void;
  onCommit: () => void;
  onParamCommit?: (paramId: string) => void;
}) {
  const commitParam = () => {
    onCommit();
    onParamCommit?.(param.id);
  };
  return (
    <FxParamControl
      label={param.label}
      value={value}
      min={0}
      max={1}
      step={0.005}
      format={v => formatParamValue(param.id, v)}
      isAiTargeted={isAiTargeted}
      onDraftChange={onDraftChange}
      onCommit={commitParam}
    />
  );
}

export function PluginFxEditor({slotId, state, onCommit, onParamCommit, aiTarget}: PluginFxEditorProps) {
  const meta = FX_SLOT_PLUGINS[slotId];
  const groups = FX_SLOT_PARAM_GROUPS[slotId];
  const {draftValues, setDraftParam, previewDraftValues, commitDraft} = useFxSlotDraft({
    slotId,
    state,
    onCommit,
  });

  useEffect(() => {
    if (aiTarget?.slot === slotId) {
      previewDraftValues(aiTarget.values);
    }
  }, [aiTarget, previewDraftValues, slotId]);

  const paramsById = useMemo(() => {
    const map = new Map<string, FxParamMeta>();
    for (const param of meta.params) {
      map.set(param.id, param);
    }
    return map;
  }, [meta.params]);

  return (
    <div className={`fx-plugin-editor fx-plugin-editor--${slotId}`} data-slot={slotId}>
      <header className="fx-plugin-header">
        <div className="fx-plugin-header-text">
          <span className="fx-plugin-vendor">Airwindows</span>
          <strong className="fx-plugin-name">{meta.displayName}</strong>
        </div>
        <span className="fx-plugin-slot-badge">{slotId}</span>
      </header>
      <div className="fx-plugin-groups">
        {groups.map(group => (
          <section key={group.title} className="fx-plugin-group">
            <h4 className="fx-plugin-group-title">{group.title}</h4>
            <div className="fx-plugin-group-params">
              {group.paramIds.map(paramId => {
                const param = paramsById.get(paramId);
                if (!param) {
                  return null;
                }
                const value = draftValues[paramId] ?? param.defaultValue;
                const isAiTargeted = Boolean(aiTarget?.values[paramId] !== undefined);
                return (
                  <ParamKnob
                    key={paramId}
                    param={param}
                    value={value}
                    isAiTargeted={isAiTargeted}
                    onDraftChange={next => setDraftParam(paramId, next)}
                    onCommit={commitDraft}
                    onParamCommit={paramId => onParamCommit?.(slotId, paramId)}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
