/**
 * Coclaw Instance Management — Type Definitions
 *
 * Per-user Coclaw agent runtime types for process management,
 * API key resolution, and usage tracking.
 */

import type { CoclawInstanceStatus } from '@prisma/client';

// ---------------------------------------------------------------------------
// Instance Management
// ---------------------------------------------------------------------------

/** In-memory representation of a running Coclaw process. */
export interface CoclawProcessInfo {
  pid: number;
  port: number;
  userId: string;
  workspaceId: string;
  status: CoclawInstanceStatus;
  startedAt: Date;
  apiKeySource: 'user' | 'system';
  providerId: string;
}

/** Global configuration for the Coclaw instance manager. */
export interface CoclawManagerConfig {
  /** Absolute path to the Coclaw binary. */
  binaryPath: string;
  /** Base directory where per-instance configs are written. */
  instancesDir: string;
  /** Instance idle timeout in ms before automatic shutdown. */
  ttlMs: number;
  /** Maximum concurrent Coclaw instances. */
  maxInstances: number;
  /** Starting port for instance allocation. */
  portRangeStart: number;
  /** Interval in ms between TTL sweep checks. */
  sweepIntervalMs: number;
}

/** Configuration used to generate per-user Coclaw config.toml before spawning. */
export interface CoclawSpawnConfig {
  /** LLM provider */
  provider: string;
  apiKey: string;
  apiKeySource: 'user' | 'system';
  model?: string;

  /** Collab integration */
  collabApiUrl: string;
  mcpToken: string;
  userId: string;
  workspaceId: string;

  /** Memory */
  memoryBackend: 'collab';
  qdrantUrl?: string;
  qdrantCollection: string;

  /** Embedding config */
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;

  /** Channel configs loaded from DB */
  channels: ChannelConfigEntry[];


  /** GitHub integration */
  githubToken?: string;
  githubDefaultOwner?: string;
  githubDefaultRepo?: string;

  /** Runtime */
  port: number;
}

// ---------------------------------------------------------------------------
// API Key Resolution
// ---------------------------------------------------------------------------

/** Result of resolving an API key for a user. */
export interface ApiKeyResolution {
  key: string;
  source: 'user' | 'system';
  provider: string;
}

/** Provider name → environment variable mapping. */
export const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
};

/** Expected key prefixes per provider (for basic validation). */
export const PROVIDER_KEY_PREFIXES: Record<string, string> = {
  anthropic: 'sk-ant-',
  openai: 'sk-',
  google: 'AI',
};

/** Display metadata for supported providers. */
export const SUPPORTED_PROVIDERS: {
  id: string;
  name: string;
  placeholder: string;
}[] = [
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-api03-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'google', name: 'Google AI', placeholder: 'AIza...' },
];

// ---------------------------------------------------------------------------
// Usage Tracking
// ---------------------------------------------------------------------------

/** Daily usage cap configuration. */
export interface UsageCap {
  maxMessagesPerDay: number;
  maxTokensPerDay: number;
}

/** Usage statistics returned to the client. */
export interface UsageStats {
  date: string;
  messageCount: number;
  tokenCount: number;
  apiKeySource: 'user' | 'system' | null;
  limits: {
    maxMessagesPerDay: number;
    maxTokensPerDay: number;
    isOverLimit: boolean;
  };
}

// ---------------------------------------------------------------------------
// Channel Configuration
// ---------------------------------------------------------------------------

/** A single channel configuration entry (from DB). */
export interface ChannelConfigEntry {
  channelType: string;
  config: Record<string, unknown>;
  enabled: boolean;
}

/** Field definition for channel configuration forms. */
export interface ChannelFieldDef {
  key: string;
  label: string;
  type: 'text' | 'password' | 'tags' | 'select' | 'number' | 'boolean';
  required: boolean;
  placeholder?: string;
  description?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
}

/** Metadata for a supported channel type. */
export interface ChannelMetadata {
  type: string;
  name: string;
  description: string;
  docsUrl?: string;
  fields: ChannelFieldDef[];
}

/** All supported Coclaw channels with their field schemas. */
export const SUPPORTED_CHANNELS: ChannelMetadata[] = [
  // ── Popular Channels ─────────────────────────────────────────────────────
  {
    type: 'telegram',
    name: 'Telegram',
    description: 'Connect a Telegram bot to receive and send messages',
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', required: true, placeholder: '123456:ABC-DEF1234...', description: 'Get from @BotFather on Telegram' },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, placeholder: 'User IDs or * for all', defaultValue: '*' },
      { key: 'stream_mode', label: 'Streaming', type: 'select', required: false, options: [{ value: 'off', label: 'Off' }, { value: 'partial', label: 'Partial' }], defaultValue: 'off' },
      { key: 'mention_only', label: 'Mention Only (groups)', type: 'boolean', required: false, defaultValue: false },
    ],
  },
  {
    type: 'discord',
    name: 'Discord',
    description: 'Connect a Discord bot to your server',
    docsUrl: 'https://discord.com/developers/applications',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', required: true, placeholder: 'MTIz...', description: 'Create at discord.com/developers/applications → Bot → Token' },
      { key: 'guild_id', label: 'Server ID', type: 'text', required: false, placeholder: '123456789012345678', description: 'Optional — restrict to one server' },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, placeholder: 'User IDs or * for all', defaultValue: '*' },
      { key: 'mention_only', label: 'Mention Only', type: 'boolean', required: false, defaultValue: false },
    ],
  },
  {
    type: 'slack',
    name: 'Slack',
    description: 'Connect a Slack bot to your workspace',
    docsUrl: 'https://api.slack.com/apps',
    fields: [
      { key: 'bot_token', label: 'Bot Token', type: 'password', required: true, placeholder: 'xoxb-...', description: 'Install app at api.slack.com/apps → OAuth → Bot User OAuth Token' },
      { key: 'app_token', label: 'App Token (Socket Mode)', type: 'password', required: false, placeholder: 'xapp-...', description: 'Required for Socket Mode — Basic Info → App-Level Tokens' },
      { key: 'channel_id', label: 'Channel ID', type: 'text', required: false, placeholder: 'C1234567890 or * for all' },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, placeholder: 'User IDs or * for all', defaultValue: '*' },
    ],
  },
  {
    type: 'whatsapp',
    name: 'WhatsApp Cloud',
    description: 'Connect via WhatsApp Cloud API (Business)',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, description: 'From Meta Developer Console → WhatsApp → API Setup' },
      { key: 'phone_number_id', label: 'Phone Number ID', type: 'text', required: true, placeholder: '123456789' },
      { key: 'business_account_id', label: 'Business Account ID', type: 'text', required: false },
      { key: 'webhook_token', label: 'Webhook Verification Token', type: 'password', required: false },
      { key: 'allowed_numbers', label: 'Allowed Numbers', type: 'tags', required: false, placeholder: 'Phone numbers or * for all', defaultValue: '*' },
    ],
  },
  {
    type: 'github',
    name: 'GitHub',
    description: 'Respond to GitHub issues, PRs, and comments',
    docsUrl: 'https://github.com/settings/tokens',
    fields: [
      { key: 'personal_access_token', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_...', description: 'Generate at github.com/settings/tokens with repo scope' },
      { key: 'owner', label: 'Repository Owner', type: 'text', required: true, placeholder: 'my-org' },
      { key: 'repo', label: 'Repository Name', type: 'text', required: true, placeholder: 'my-repo' },
      { key: 'webhook_secret', label: 'Webhook Secret', type: 'password', required: false },
    ],
  },
  {
    type: 'email',
    name: 'Email',
    description: 'Connect via IMAP/SMTP for email communication',
    fields: [
      { key: 'imap_host', label: 'IMAP Host', type: 'text', required: true, placeholder: 'imap.gmail.com' },
      { key: 'imap_port', label: 'IMAP Port', type: 'number', required: false, defaultValue: '993' },
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', required: true, placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', required: false, defaultValue: '587' },
      { key: 'username', label: 'Email Address', type: 'text', required: true, placeholder: 'you@example.com' },
      { key: 'password', label: 'Password / App Password', type: 'password', required: true, description: 'For Gmail, generate an App Password at myaccount.google.com' },
      { key: 'allowed_senders', label: 'Allowed Senders', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  // ── Chat Platforms ───────────────────────────────────────────────────────
  {
    type: 'matrix',
    name: 'Matrix',
    description: 'Connect to a Matrix homeserver (Element, etc.)',
    fields: [
      { key: 'homeserver', label: 'Homeserver URL', type: 'text', required: true, placeholder: 'https://matrix.example.com' },
      { key: 'access_token', label: 'Access Token', type: 'password', required: true, placeholder: 'syt_...' },
      { key: 'room_id', label: 'Room ID', type: 'text', required: true, placeholder: '!room:matrix.example.com' },
      { key: 'user_id', label: 'User ID', type: 'text', required: false, placeholder: '@coclaw:matrix.example.com' },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'signal',
    name: 'Signal',
    description: 'Connect via Signal messenger (requires signal-cli)',
    docsUrl: 'https://github.com/AsamK/signal-cli',
    fields: [
      { key: 'phone_number', label: 'Phone Number', type: 'text', required: true, placeholder: '+1234567890' },
      { key: 'signal_cli_path', label: 'signal-cli Path', type: 'text', required: false, placeholder: '/usr/local/bin/signal-cli' },
      { key: 'allowed_numbers', label: 'Allowed Numbers', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'mattermost',
    name: 'Mattermost',
    description: 'Connect a Mattermost bot to your team',
    docsUrl: 'https://developers.mattermost.com/integrate/bots/',
    fields: [
      { key: 'url', label: 'Server URL', type: 'text', required: true, placeholder: 'https://mattermost.example.com' },
      { key: 'token', label: 'Bot Token', type: 'password', required: true, description: 'Create a bot account at System Console → Integrations → Bot Accounts' },
      { key: 'team_id', label: 'Team ID', type: 'text', required: false },
      { key: 'channel_id', label: 'Channel ID', type: 'text', required: false },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'irc',
    name: 'IRC',
    description: 'Connect to an IRC server and channel',
    fields: [
      { key: 'server', label: 'IRC Server', type: 'text', required: true, placeholder: 'irc.libera.chat' },
      { key: 'port', label: 'Port', type: 'number', required: false, defaultValue: '6697' },
      { key: 'nickname', label: 'Nickname', type: 'text', required: true, placeholder: 'coclaw-bot' },
      { key: 'channel', label: 'Channel', type: 'text', required: true, placeholder: '#my-channel' },
      { key: 'password', label: 'Server Password', type: 'password', required: false },
      { key: 'use_tls', label: 'Use TLS', type: 'boolean', required: false, defaultValue: true },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'nostr',
    name: 'Nostr',
    description: 'Connect to the Nostr decentralized network',
    docsUrl: 'https://nostr.com',
    fields: [
      { key: 'private_key', label: 'Private Key (nsec)', type: 'password', required: true, placeholder: 'nsec1...' },
      { key: 'relays', label: 'Relay URLs', type: 'tags', required: false, placeholder: 'wss://relay.damus.io', description: 'Comma-separated relay URLs' },
    ],
  },
  // ── Enterprise / Team Platforms ──────────────────────────────────────────
  {
    type: 'lark',
    name: 'Lark',
    description: 'Connect to Lark (Bytedance) as a bot',
    docsUrl: 'https://open.larksuite.com/document',
    fields: [
      { key: 'app_id', label: 'App ID', type: 'text', required: true },
      { key: 'app_secret', label: 'App Secret', type: 'password', required: true },
      { key: 'encrypt_key', label: 'Encrypt Key', type: 'password', required: false },
      { key: 'verification_token', label: 'Verification Token', type: 'password', required: false },
    ],
  },
  {
    type: 'feishu',
    name: 'Feishu',
    description: 'Connect to Feishu (Chinese Lark) as a bot',
    docsUrl: 'https://open.feishu.cn/document',
    fields: [
      { key: 'app_id', label: 'App ID', type: 'text', required: true },
      { key: 'app_secret', label: 'App Secret', type: 'password', required: true },
      { key: 'encrypt_key', label: 'Encrypt Key', type: 'password', required: false },
      { key: 'verification_token', label: 'Verification Token', type: 'password', required: false },
    ],
  },
  {
    type: 'dingtalk',
    name: 'DingTalk',
    description: 'Connect to DingTalk (Alibaba) as a bot',
    docsUrl: 'https://open.dingtalk.com/document',
    fields: [
      { key: 'app_key', label: 'App Key', type: 'text', required: true },
      { key: 'app_secret', label: 'App Secret', type: 'password', required: true },
      { key: 'robot_code', label: 'Robot Code', type: 'text', required: false },
    ],
  },
  {
    type: 'nextcloud_talk',
    name: 'Nextcloud Talk',
    description: 'Connect to Nextcloud Talk as a bot',
    docsUrl: 'https://nextcloud-talk.readthedocs.io/',
    fields: [
      { key: 'url', label: 'Nextcloud URL', type: 'text', required: true, placeholder: 'https://cloud.example.com' },
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password / App Token', type: 'password', required: true },
      { key: 'token', label: 'Talk Room Token', type: 'text', required: false },
    ],
  },
  // ── Chinese Messaging ───────────────────────────────────────────────────
  {
    type: 'napcat',
    name: 'QQ (NapCat)',
    description: 'Connect to QQ via NapCat/OneBot v11 protocol',
    docsUrl: 'https://napneko.github.io/',
    fields: [
      { key: 'ws_url', label: 'WebSocket URL', type: 'text', required: true, placeholder: 'ws://127.0.0.1:3001', description: 'NapCat or go-cqhttp WebSocket endpoint' },
      { key: 'access_token', label: 'Access Token', type: 'password', required: false },
      { key: 'allowed_users', label: 'Allowed Users', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'qq',
    name: 'QQ Official',
    description: 'Connect via QQ Official Bot API',
    docsUrl: 'https://bot.q.qq.com/',
    fields: [
      { key: 'app_id', label: 'App ID', type: 'text', required: true },
      { key: 'app_secret', label: 'App Secret', type: 'password', required: true },
      { key: 'token', label: 'Bot Token', type: 'password', required: false },
    ],
  },
  // ── Apple Messaging ─────────────────────────────────────────────────────
  {
    type: 'imessage',
    name: 'iMessage',
    description: 'Connect via iMessage (macOS only)',
    fields: [
      { key: 'handle', label: 'Your Apple ID', type: 'text', required: false, placeholder: 'you@icloud.com' },
      { key: 'allowed_senders', label: 'Allowed Senders', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'bluebubbles',
    name: 'BlueBubbles',
    description: 'iMessage bridge via BlueBubbles server',
    docsUrl: 'https://bluebubbles.app/',
    fields: [
      { key: 'url', label: 'Server URL', type: 'text', required: true, placeholder: 'http://192.168.1.100:1234' },
      { key: 'password', label: 'Server Password', type: 'password', required: true },
      { key: 'allowed_senders', label: 'Allowed Senders', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  // ── WhatsApp Business ───────────────────────────────────────────────────
  {
    type: 'wati',
    name: 'WATI',
    description: 'Connect via WATI WhatsApp Business API',
    docsUrl: 'https://docs.wati.io/',
    fields: [
      { key: 'api_url', label: 'WATI API URL', type: 'text', required: true, placeholder: 'https://live-server-123.wati.io' },
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'allowed_numbers', label: 'Allowed Numbers', type: 'tags', required: false, defaultValue: '*' },
    ],
  },
  {
    type: 'whatsapp_web',
    name: 'WhatsApp Web',
    description: 'Connect via native WhatsApp Web protocol (QR code or pair code)',
    docsUrl: 'https://web.whatsapp.com/',
    fields: [
      { key: 'session_path', label: 'Session Path', type: 'text', required: false, placeholder: '~/.coclaw/whatsapp-session.db', description: 'Database path for WhatsApp Web session (auto-configured in Docker)' },
      { key: 'pair_phone', label: 'Phone Number (for pair code)', type: 'text', required: false, placeholder: '15551234567', description: 'Country code + number without +. Leave empty for QR code pairing.' },
      { key: 'allowed_numbers', label: 'Allowed Numbers', type: 'tags', required: false, placeholder: 'Phone numbers or * for all', defaultValue: '*' },
    ],
  },
  // ── Integration Channels ────────────────────────────────────────────────
  {
    type: 'webhook',
    name: 'Webhook',
    description: 'Receive messages via HTTP webhook',
    fields: [
      { key: 'secret', label: 'Webhook Secret', type: 'password', required: false, description: 'Shared secret for verifying webhook signatures' },
      { key: 'allowed_ips', label: 'Allowed IPs', type: 'tags', required: false, placeholder: 'IP addresses or * for all', defaultValue: '*' },
    ],
  },
  {
    type: 'linq',
    name: 'Linq',
    description: 'Connect via Linq Partner API',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'tenant_id', label: 'Tenant ID', type: 'text', required: false },
    ],
  },
];

/** Default model per provider. */
export const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
};

/** Coclaw config directory path for a user+workspace instance. */
export function instanceConfigDir(baseDir: string, userId: string, workspaceId: string): string {
  return `${baseDir}/${userId}-${workspaceId}`;
}
