import * as fs from 'node:fs';
import * as path from 'node:path';
import type {PublicDemoConfig} from './publicDemoConfig';

type UsageFile = {
  version: 1;
  copilotMessagesUsed: number;
};

export type PublicDemoUsageSnapshot = {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
};

function emptyUsage(): UsageFile {
  return {version: 1, copilotMessagesUsed: 0};
}

function readUsage(filePath?: string): UsageFile {
  if (!filePath || !fs.existsSync(filePath)) return emptyUsage();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<UsageFile>;
    return parsed.version === 1 && Number.isFinite(parsed.copilotMessagesUsed)
      ? {version: 1, copilotMessagesUsed: Math.max(0, Math.floor(parsed.copilotMessagesUsed ?? 0))}
      : emptyUsage();
  } catch {
    return emptyUsage();
  }
}

function writeUsage(filePath: string | undefined, usage: UsageFile): void {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, JSON.stringify(usage, null, 2), 'utf8');
}

export function publicDemoUsageStatus(
  config: PublicDemoConfig,
  usagePath?: string,
): PublicDemoUsageSnapshot {
  const used = config.enabled ? readUsage(usagePath).copilotMessagesUsed : 0;
  const limit = config.enabled ? config.copilotMessageLimit : 0;
  return {
    enabled: config.enabled,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

export function consumePublicDemoCopilotMessage(
  config: PublicDemoConfig,
  usagePath?: string,
): {ok: true; snapshot: PublicDemoUsageSnapshot} | {ok: false; snapshot: PublicDemoUsageSnapshot; error: string} {
  if (!config.enabled) {
    return {ok: true, snapshot: publicDemoUsageStatus(config, usagePath)};
  }
  const usage = readUsage(usagePath);
  if (usage.copilotMessagesUsed >= config.copilotMessageLimit) {
    return {
      ok: false,
      snapshot: publicDemoUsageStatus(config, usagePath),
      error: 'Demo Copilot limit reached. Please see the demo video for the full workflow.',
    };
  }
  usage.copilotMessagesUsed += 1;
  writeUsage(usagePath, usage);
  return {ok: true, snapshot: publicDemoUsageStatus(config, usagePath)};
}
