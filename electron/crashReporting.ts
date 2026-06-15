import type {App, CrashReporter, CrashReporterStartOptions} from 'electron';

export type CrashReportingStatus = {
  uploadToServer: boolean;
  releaseChannel: string;
  submitURL?: string;
};

type CrashReportingRuntime = {
  app: Pick<App, 'getName' | 'getVersion' | 'isPackaged'>;
  crashReporter: Pick<CrashReporter, 'start'>;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
};

function crashUploadUrl(env: NodeJS.ProcessEnv): string | undefined {
  const rawUrl = env.AI_PRODUCER_CRASH_UPLOAD_URL?.trim();
  if (!rawUrl) {
    return undefined;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function releaseChannel(app: Pick<App, 'isPackaged'>, env: NodeJS.ProcessEnv): string {
  return env.AI_PRODUCER_RELEASE_CHANNEL?.trim() || (app.isPackaged ? 'production' : 'development');
}

export function startCrashReporting(runtime: CrashReportingRuntime): CrashReportingStatus {
  const env = runtime.env ?? process.env;
  const submitURL = crashUploadUrl(env);
  const channel = releaseChannel(runtime.app, env);
  const uploadToServer = Boolean(submitURL);
  const options: CrashReporterStartOptions = {
    productName: runtime.app.getName(),
    uploadToServer,
    rateLimit: true,
    compress: true,
    ignoreSystemCrashHandler: false,
    globalExtra: {
      appVersion: runtime.app.getVersion(),
      releaseChannel: channel,
      platform: runtime.platform ?? process.platform,
      packaged: String(runtime.app.isPackaged),
    },
    extra: {
      processRole: 'browser',
    },
  };

  if (submitURL) {
    options.submitURL = submitURL;
  }

  runtime.crashReporter.start(options);
  return {uploadToServer, releaseChannel: channel, submitURL};
}
