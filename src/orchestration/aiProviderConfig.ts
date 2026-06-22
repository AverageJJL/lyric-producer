import type {ArrangementValidationError} from './schemaValidation';

export const AI_PROVIDER_ENV = {
  apiKey: 'OPENAI_API_KEY',
  model: 'AI_PRODUCER_MODEL',
  environment: 'AI_PRODUCER_ENVIRONMENT',
  baseUrl: 'AI_PRODUCER_API_BASE_URL',
} as const;

export const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini-search-preview';

export type AiRuntimeEnvironment = 'development' | 'test' | 'production';

export type AiProviderConfig = {
  provider: 'openai';
  model: string;
  environment: AiRuntimeEnvironment;
  apiKeyEnvVar: string;
  apiKeyStatus: '[set]';
  baseUrl?: string;
};

export type AiProviderConfigInput = {
  env: Record<string, string | undefined>;
  provider?: 'openai';
  model?: string;
  environment?: string;
  apiKeyEnvVar?: string;
  baseUrl?: string;
};

export type AiProviderConfigResult =
  | {ok: true; config: AiProviderConfig}
  | {ok: false; errors: ArrangementValidationError[]};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function error(
  errors: ArrangementValidationError[],
  path: string,
  message: string,
): void {
  errors.push({path, message});
}

function runtimeEnvironment(
  value: string | undefined,
  errors: ArrangementValidationError[],
): AiRuntimeEnvironment {
  const normalized = clean(value) ?? 'development';
  if (
    normalized === 'development' ||
    normalized === 'test' ||
    normalized === 'production'
  ) {
    return normalized;
  }
  error(errors, 'environment', 'Expected development, test, or production.');
  return 'development';
}

function validateBaseUrl(value: string | undefined, errors: ArrangementValidationError[]): string | undefined {
  const baseUrl = clean(value);
  if (!baseUrl) {
    return undefined;
  }
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol === 'https:') {
      return baseUrl;
    }
  } catch {
    // Fall through to shared error below.
  }
  error(errors, 'baseUrl', 'Expected an HTTPS URL.');
  return undefined;
}

export function resolveAiProviderConfig(
  input: AiProviderConfigInput,
): AiProviderConfigResult {
  const errors: ArrangementValidationError[] = [];
  const env = input.env;
  const apiKeyEnvVar = clean(input.apiKeyEnvVar) ?? AI_PROVIDER_ENV.apiKey;
  const model = clean(input.model) ?? clean(env[AI_PROVIDER_ENV.model]) ?? DEFAULT_AI_MODEL;
  const apiKey = clean(env[apiKeyEnvVar]);
  const environment = runtimeEnvironment(
    input.environment ?? env[AI_PROVIDER_ENV.environment],
    errors,
  );
  const baseUrl = validateBaseUrl(input.baseUrl ?? env[AI_PROVIDER_ENV.baseUrl], errors);

  if (!apiKey) {
    error(errors, 'apiKey', `Expected API key in ${apiKeyEnvVar}.`);
  }
  if (errors.length > 0 || !model || !apiKey) {
    return {ok: false, errors};
  }

  return {
    ok: true,
    config: {
      provider: input.provider ?? 'openai',
      model,
      environment,
      apiKeyEnvVar,
      apiKeyStatus: '[set]',
      baseUrl,
    },
  };
}
