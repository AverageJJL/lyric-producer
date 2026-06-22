import * as fs from 'node:fs';
import * as path from 'node:path';

type RawPublicDemoConfig = {
  enabled?: unknown;
  openRouterProxyBaseUrl?: unknown;
  openRouterPublicToken?: unknown;
  openRouterModel?: unknown;
  openRouterFallbackModels?: unknown;
  copilotMessageLimit?: unknown;
  disableLiveCyanite?: unknown;
  disableLiveSongSeedProviders?: unknown;
  cyaniteLimitMessage?: unknown;
};

export type PublicDemoConfig = {
  enabled: boolean;
  openRouterProxyBaseUrl?: string;
  openRouterPublicToken: string;
  openRouterModel: string;
  openRouterFallbackModels: string[];
  copilotMessageLimit: number;
  disableLiveCyanite: boolean;
  disableLiveSongSeedProviders: boolean;
  cyaniteLimitMessage: string;
};

export const PUBLIC_DEMO_CYANITE_LIMIT_MESSAGE =
  'Cyanite usage limits reached in the public demo. Please see the demo video for how this feature works.';

const DEFAULT_PUBLIC_TOKEN = 'apc-public-demo';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_FALLBACK_MODELS = ['openai/gpt-4.1-nano', 'openai/gpt-4.1-mini'];

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
}

function positiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter((item): item is string => Boolean(item));
  }
  return cleanString(value)?.split(',').map(item => item.trim()).filter(Boolean);
}

function readRawConfig(readRoot?: string): RawPublicDemoConfig {
  if (!readRoot) return {};
  const configPath = path.join(readRoot, 'song-seed', 'demo-config.json');
  if (!fs.existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as RawPublicDemoConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readPublicDemoConfig(
  readRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
): PublicDemoConfig {
  const raw = readRawConfig(readRoot);
  const enabled = bool(env.AI_PRODUCER_PUBLIC_DEMO) ?? bool(raw.enabled) ?? false;
  return {
    enabled,
    openRouterProxyBaseUrl: cleanString(env.AI_PRODUCER_DEMO_PROXY_BASE_URL)
      ?? cleanString(raw.openRouterProxyBaseUrl),
    openRouterPublicToken: cleanString(env.AI_PRODUCER_DEMO_PUBLIC_TOKEN)
      ?? cleanString(raw.openRouterPublicToken)
      ?? DEFAULT_PUBLIC_TOKEN,
    openRouterModel: cleanString(env.AI_PRODUCER_DEMO_MODEL)
      ?? cleanString(raw.openRouterModel)
      ?? DEFAULT_MODEL,
    openRouterFallbackModels: stringArray(env.AI_PRODUCER_DEMO_FALLBACK_MODELS)
      ?? stringArray(raw.openRouterFallbackModels)
      ?? DEFAULT_FALLBACK_MODELS,
    copilotMessageLimit: positiveInt(env.AI_PRODUCER_DEMO_COPILOT_LIMIT)
      ?? positiveInt(raw.copilotMessageLimit)
      ?? 5,
    disableLiveCyanite: bool(env.AI_PRODUCER_DEMO_DISABLE_CYANITE)
      ?? bool(raw.disableLiveCyanite)
      ?? enabled,
    disableLiveSongSeedProviders: bool(env.AI_PRODUCER_DEMO_DISABLE_SONG_SEED_PROVIDERS)
      ?? bool(raw.disableLiveSongSeedProviders)
      ?? enabled,
    cyaniteLimitMessage: cleanString(env.AI_PRODUCER_DEMO_CYANITE_MESSAGE)
      ?? cleanString(raw.cyaniteLimitMessage)
      ?? PUBLIC_DEMO_CYANITE_LIMIT_MESSAGE,
  };
}

export function songSeedEnvForPublicDemo(
  env: NodeJS.ProcessEnv,
  config: PublicDemoConfig,
): NodeJS.ProcessEnv {
  if (!config.enabled || !config.disableLiveSongSeedProviders) return env;
  const next: NodeJS.ProcessEnv = {...env};
  delete next.MUSIXMATCH_API_KEY;
  delete next.GETSONGBPM_API_KEY;
  delete next.OPENROUTER_API_KEY;
  return next;
}

export function copilotEnvForPublicDemo(
  env: NodeJS.ProcessEnv,
  config: PublicDemoConfig,
): NodeJS.ProcessEnv {
  if (!config.enabled) return env;
  return {
    ...env,
    OPENROUTER_API_KEY: config.openRouterPublicToken,
    AI_PRODUCER_API_BASE_URL: config.openRouterProxyBaseUrl ?? '',
    AI_PRODUCER_AGENT_MODEL: config.openRouterModel,
    AI_PRODUCER_FALLBACK_MODELS: config.openRouterFallbackModels.join(','),
    AI_PRODUCER_MODEL: config.openRouterModel,
  };
}
