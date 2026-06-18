import {
  AI_PROVIDER_ENV,
  DEFAULT_AI_MODEL,
  resolveAiProviderConfig,
} from '../src/orchestration/aiProviderConfig';

describe('AI provider config', () => {
  it('resolves model, environment, base URL, and redacted key status from env', () => {
    const result = resolveAiProviderConfig({
      env: {
        [AI_PROVIDER_ENV.apiKey]: 'sk-secret-value',
        [AI_PROVIDER_ENV.model]: 'gpt-test-model',
        [AI_PROVIDER_ENV.environment]: 'test',
        [AI_PROVIDER_ENV.baseUrl]: 'https://api.example.test/v1',
      },
    });

    expect(result).toMatchObject({ok: true});
    if (!result.ok) {
      throw new Error('expected valid config');
    }

    expect(result.config).toEqual({
      provider: 'openai',
      model: 'gpt-test-model',
      environment: 'test',
      apiKeyEnvVar: AI_PROVIDER_ENV.apiKey,
      apiKeyStatus: '[set]',
      baseUrl: 'https://api.example.test/v1',
    });
    expect(JSON.stringify(result.config)).not.toContain('sk-secret-value');
  });

  it('allows explicit model, environment, and API key env var overrides', () => {
    const result = resolveAiProviderConfig({
      env: {
        CUSTOM_AI_KEY: 'custom-secret',
      },
      model: 'override-model',
      environment: 'production',
      apiKeyEnvVar: 'CUSTOM_AI_KEY',
    });

    expect(result).toMatchObject({
      ok: true,
      config: {
        model: 'override-model',
        environment: 'production',
        apiKeyEnvVar: 'CUSTOM_AI_KEY',
        apiKeyStatus: '[set]',
      },
    });
    expect(JSON.stringify(result)).not.toContain('custom-secret');
  });

  it('uses the default model when no model override or env value is provided', () => {
    const result = resolveAiProviderConfig({
      env: {
        [AI_PROVIDER_ENV.apiKey]: 'sk-secret-value',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      config: {
        model: DEFAULT_AI_MODEL,
      },
    });
  });

  it('rejects missing secrets, invalid environment, and non-HTTPS base URLs', () => {
    const result = resolveAiProviderConfig({
      env: {
        [AI_PROVIDER_ENV.environment]: 'staging',
        [AI_PROVIDER_ENV.baseUrl]: 'http://api.example.test/v1',
      },
    });

    expect(result).toMatchObject({ok: false});
    expect(result.ok ? [] : result.errors).toEqual(expect.arrayContaining([
      {path: 'environment', message: 'Expected development, test, or production.'},
      {path: 'baseUrl', message: 'Expected an HTTPS URL.'},
      {path: 'apiKey', message: `Expected API key in ${AI_PROVIDER_ENV.apiKey}.`},
    ]));
  });
});
