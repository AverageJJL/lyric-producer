import {FX_SLOT_PLUGINS} from '../music/fxPluginMetadata';
import {FX_SLOT_ORDER, type FxSlotId, type PluginHostFormat, type PluginHostStatus} from './fxContract';
import {sendNativeAudioCommand} from './NativeAudioEngine';

export type FxPluginCatalogParam = {
  id: string;
  label: string;
  defaultValue: number;
};

export type FxPluginCatalogItem = {
  slot: FxSlotId;
  pluginId: string;
  displayName: string;
  format: PluginHostFormat;
  status: PluginHostStatus;
  params: FxPluginCatalogParam[];
  recoveryHint?: string;
};

export type FxPluginCatalog = {
  catalogVersion: number;
  externalPluginHosting: 'disabled' | 'enabled';
  formats: Array<{format: PluginHostFormat; enabled: boolean; reason?: string}>;
  plugins: FxPluginCatalogItem[];
};

export type FxPluginScanFormat = Extract<PluginHostFormat, 'external_au' | 'external_vst3'>;

export type FxPluginScanCandidate = {
  pluginId: string;
  displayName: string;
  format: FxPluginScanFormat;
  path: string;
  status: PluginHostStatus;
  recoveryHint?: string;
};

export type FxPluginScanPath = {
  path: string;
  status: 'scanned' | 'missing' | 'not_directory';
  reason?: string;
};

export type FxPluginScanResult = {
  scanVersion: number;
  externalPluginHosting: 'scan_metadata_only' | 'disabled' | 'enabled';
  defaultPathsUsed: boolean;
  recursive: boolean;
  truncated: boolean;
  scannedPaths: FxPluginScanPath[];
  formatCounts: Record<FxPluginScanFormat, number>;
  candidates: FxPluginScanCandidate[];
};

export type FxPluginScanOptions = {
  formats?: FxPluginScanFormat[];
  recursive?: boolean;
  maxCandidates?: number;
};

function isFxSlotId(value: unknown): value is FxSlotId {
  return typeof value === 'string' && FX_SLOT_ORDER.includes(value as FxSlotId);
}

function hostFormat(value: unknown): PluginHostFormat {
  return value === 'external_au' || value === 'external_vst3' ? value : 'builtin_airwindows';
}

function hostStatus(value: unknown): PluginHostStatus {
  return value === 'missing' || value === 'disabled' ? value : 'available';
}

function scanFormat(value: unknown): FxPluginScanFormat | null {
  return value === 'external_au' || value === 'external_vst3' ? value : null;
}

function fallbackCatalog(): FxPluginCatalog {
  return {
    catalogVersion: 1,
    externalPluginHosting: 'disabled',
    formats: [
      {format: 'builtin_airwindows', enabled: true},
      {format: 'external_au', enabled: false, reason: 'external_plugin_hosting_disabled'},
      {format: 'external_vst3', enabled: false, reason: 'external_plugin_hosting_disabled'},
    ],
    plugins: FX_SLOT_ORDER.map(slot => {
      const meta = FX_SLOT_PLUGINS[slot];
      return {
        slot,
        pluginId: meta.pluginId,
        displayName: meta.displayName,
        format: 'builtin_airwindows',
        status: 'available',
        params: meta.params,
      };
    }),
  };
}

function emptyScanResult(recursive = true): FxPluginScanResult {
  return {
    scanVersion: 1,
    externalPluginHosting: 'scan_metadata_only',
    defaultPathsUsed: false,
    recursive,
    truncated: false,
    scannedPaths: [],
    formatCounts: {external_au: 0, external_vst3: 0},
    candidates: [],
  };
}

function catalogItem(value: unknown): FxPluginCatalogItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<FxPluginCatalogItem>;
  if (!isFxSlotId(item.slot)) {
    return null;
  }
  const meta = FX_SLOT_PLUGINS[item.slot];
  return {
    slot: item.slot,
    pluginId: typeof item.pluginId === 'string' && item.pluginId ? item.pluginId : meta.pluginId,
    displayName: typeof item.displayName === 'string' && item.displayName
      ? item.displayName
      : meta.displayName,
    format: hostFormat(item.format),
    status: hostStatus(item.status),
    params: Array.isArray(item.params) ? item.params : meta.params,
    recoveryHint: typeof item.recoveryHint === 'string' ? item.recoveryHint : undefined,
  };
}

function scanPath(value: unknown): FxPluginScanPath | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<FxPluginScanPath>;
  if (typeof item.path !== 'string' || !item.path) {
    return null;
  }
  if (item.status !== 'scanned' && item.status !== 'missing' && item.status !== 'not_directory') {
    return null;
  }
  return {
    path: item.path,
    status: item.status,
    reason: typeof item.reason === 'string' ? item.reason : undefined,
  };
}

function scanCandidate(value: unknown): FxPluginScanCandidate | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<FxPluginScanCandidate>;
  const format = scanFormat(item.format);
  if (
    !format ||
    typeof item.pluginId !== 'string' ||
    typeof item.displayName !== 'string' ||
    typeof item.path !== 'string'
  ) {
    return null;
  }
  return {
    pluginId: item.pluginId,
    displayName: item.displayName,
    format,
    path: item.path,
    status: hostStatus(item.status),
    recoveryHint: typeof item.recoveryHint === 'string' ? item.recoveryHint : undefined,
  };
}

export function getFxPluginCatalog(): FxPluginCatalog {
  const fallback = fallbackCatalog();
  const response = sendNativeAudioCommand('list_fx_plugins', {});
  if (!response) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Partial<FxPluginCatalog>};
    const data = parsed.data;
    const plugins = Array.isArray(data?.plugins)
      ? data.plugins.map(catalogItem).filter((plugin): plugin is FxPluginCatalogItem => Boolean(plugin))
      : [];
    if (!parsed.ok || plugins.length === 0) {
      return fallback;
    }
    return {
      ...fallback,
      catalogVersion: typeof data?.catalogVersion === 'number' ? data.catalogVersion : fallback.catalogVersion,
      externalPluginHosting: data?.externalPluginHosting === 'enabled' ? 'enabled' : 'disabled',
      formats: Array.isArray(data?.formats) ? data.formats : fallback.formats,
      plugins,
    };
  } catch {
    return fallback;
  }
}

export function scanFxPlugins(paths: string[] = [], options: FxPluginScanOptions = {}): FxPluginScanResult {
  const response = sendNativeAudioCommand('scan_fx_plugins', {
    paths,
    formats: options.formats,
    recursive: options.recursive,
    maxCandidates: options.maxCandidates,
  });
  if (!response) {
    return emptyScanResult(options.recursive);
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Partial<FxPluginScanResult>};
    const data = parsed.data;
    if (!parsed.ok || !data) {
      return emptyScanResult(options.recursive);
    }
    const fallback = emptyScanResult(data.recursive ?? options.recursive);
    const candidates = Array.isArray(data.candidates)
      ? data.candidates.map(scanCandidate).filter((candidate): candidate is FxPluginScanCandidate => Boolean(candidate))
      : [];
    const scannedPaths = Array.isArray(data.scannedPaths)
      ? data.scannedPaths.map(scanPath).filter((item): item is FxPluginScanPath => Boolean(item))
      : [];
    return {
      ...fallback,
      scanVersion: typeof data.scanVersion === 'number' ? data.scanVersion : fallback.scanVersion,
      externalPluginHosting: data.externalPluginHosting === 'enabled' || data.externalPluginHosting === 'disabled'
        ? data.externalPluginHosting
        : 'scan_metadata_only',
      defaultPathsUsed: data.defaultPathsUsed === true,
      recursive: typeof data.recursive === 'boolean' ? data.recursive : fallback.recursive,
      truncated: data.truncated === true,
      scannedPaths,
      formatCounts: {
        external_au: typeof data.formatCounts?.external_au === 'number'
          ? data.formatCounts.external_au
          : candidates.filter(candidate => candidate.format === 'external_au').length,
        external_vst3: typeof data.formatCounts?.external_vst3 === 'number'
          ? data.formatCounts.external_vst3
          : candidates.filter(candidate => candidate.format === 'external_vst3').length,
      },
      candidates,
    };
  } catch {
    return emptyScanResult(options.recursive);
  }
}
