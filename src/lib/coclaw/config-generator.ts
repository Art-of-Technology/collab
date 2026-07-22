import { promises as fs } from 'fs';
import path from 'path';
import {
  type ChannelConfigEntry,
  type CoclawSpawnConfig,
  DEFAULT_MODELS,
  instanceConfigDir,
} from './types';

function toTomlPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function tomlEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function formatTomlValue(value: unknown): string {
  if (typeof value === 'string') {
    return `"${tomlEscape(value)}"`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '0';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string')) {
    const entries = value.map((entry) => `"${tomlEscape(entry)}"`).join(', ');
    return `[${entries}]`;
  }

  return `"${tomlEscape(String(value))}"`;
}

function renderChannelConfig(channel: ChannelConfigEntry): string[] {
  const lines = [`[channels_config.${channel.channelType}]`];

  for (const [key, value] of Object.entries(channel.config)) {
    lines.push(`${key} = ${formatTomlValue(value)}`);
  }

  return lines;
}

export function getInstanceDir(userId: string, workspaceId: string): string {
  const baseDir = process.env.COCLAW_INSTANCES_DIR
    || path.resolve(process.cwd(), '..', 'data', 'coclaw-instances');
  return instanceConfigDir(baseDir, userId, workspaceId);
}

function buildCoclawConfig(config: CoclawSpawnConfig, instanceDir: string): string {
  const workspaceDir = toTomlPath(path.join(instanceDir, 'workspace'));
  const configPath = toTomlPath(path.join(instanceDir, 'config.toml'));
  const model = config.model || DEFAULT_MODELS[config.provider] || 'gpt-4o';

  const lines: string[] = [
    `workspace_dir = "${tomlEscape(workspaceDir)}"`,
    `config_path = "${tomlEscape(configPath)}"`,
    `api_key = "${tomlEscape(config.apiKey)}"`,
    `default_provider = "${tomlEscape(config.provider)}"`,
    `default_model = "${tomlEscape(model)}"`,
    'default_temperature = 0.7',
    '',
    '[gateway]',
    `port = ${config.port}`,
    'host = "127.0.0.1"',
    'allow_public_bind = false',
    '',
    '[memory]',
    `backend = "${tomlEscape(config.memoryBackend)}"`,
    'auto_save = true',
    `embedding_provider = "${tomlEscape(config.embeddingProvider)}"`,
    `embedding_model = "${tomlEscape(config.embeddingModel)}"`,
    `embedding_dimensions = ${config.embeddingDimensions}`,
    '[memory.collab]',
    `api_url = "${tomlEscape(config.collabApiUrl)}"`,
    `api_token = "${tomlEscape(config.mcpToken)}"`,
    `user_id = "${tomlEscape(config.userId)}"`,
    `workspace_id = "${tomlEscape(config.workspaceId)}"`,
    `qdrant_collection = "${tomlEscape(config.qdrantCollection)}"`,
    `qdrant_url = "${tomlEscape(config.qdrantUrl || 'http://qdrant:6333')}"`,
    '',
    '[channels_config]',
    'cli = false',
    '',
    '# Auto-configured Collab web platform channel',
    '[channels_config.collab]',
    `api_url = "${tomlEscape(config.collabApiUrl)}"`,
    `api_token = "${tomlEscape(config.mcpToken)}"`,
    `user_id = "${tomlEscape(config.userId)}"`,
    `workspace_id = "${tomlEscape(config.workspaceId)}"`,
    'poll_interval_secs = 2',
  ];

  // GitHub integration section (separate from channels_config.github)
  if (config.githubToken) {
    lines.push(
      '',
      '# GitHub integration — agent-driven repository operations',
      '[github]',
      `token = "${tomlEscape(config.githubToken)}"`,
    );
    if (config.githubDefaultOwner) {
      lines.push(`default_owner = "${tomlEscape(config.githubDefaultOwner)}"`);
    }
    if (config.githubDefaultRepo) {
      lines.push(`default_repo = "${tomlEscape(config.githubDefaultRepo)}"`);
    }
  }
  for (const channel of config.channels.filter((entry) => entry.enabled)) {
    lines.push('', ...renderChannelConfig(channel));
  }

  lines.push('');
  return lines.join('\n');
}

export function generateCoclawConfig(config: CoclawSpawnConfig): string {
  return buildCoclawConfig(config, getInstanceDir(config.userId, config.workspaceId));
}

export async function writeInstanceConfig(instanceDir: string, config: CoclawSpawnConfig): Promise<void> {
  const workspaceDir = path.join(instanceDir, 'workspace');
  await fs.mkdir(instanceDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });

  const configToml = buildCoclawConfig(config, instanceDir);
  await fs.writeFile(path.join(instanceDir, 'config.toml'), configToml, 'utf-8');
}
