/**
 * Coclaw Channel Utilities
 *
 * Validation, lookup, and helper functions for channel configuration.
 * Channel definitions live in ./types.ts — this module provides utilities
 * used by API routes, MCP tools, and the TOML generator.
 */

import { SUPPORTED_CHANNELS, type ChannelMetadata, type ChannelFieldDef } from './types';

export type { ChannelMetadata, ChannelFieldDef };

/** Lookup map by channel type ID. */
export const CHANNEL_MAP = new Map<string, ChannelMetadata>(
  SUPPORTED_CHANNELS.map((c) => [c.type, c]),
);

/** All valid channel type IDs. */
export const VALID_CHANNEL_TYPES = new Set(SUPPORTED_CHANNELS.map((c) => c.type));

/**
 * Validate a channel config object against its field schema.
 * Returns an array of error messages (empty = valid).
 */
export function validateChannelConfig(
  channelType: string,
  config: Record<string, unknown>,
): string[] {
  const def = CHANNEL_MAP.get(channelType);
  if (!def) return [`Unknown channel type: ${channelType}`];

  const errors: string[] = [];
  for (const field of def.fields) {
    if (!field.required) continue;
    const val = config[field.key];
    if (val === undefined || val === null || val === '') {
      errors.push(`${field.label} is required`);
    }
  }
  return errors;
}

/**
 * Get field keys that contain sensitive data (type 'password').
 */
export function getSecretFields(channelType: string): string[] {
  const def = CHANNEL_MAP.get(channelType);
  if (!def) return [];
  return def.fields.filter((f) => f.type === 'password').map((f) => f.key);
}

/**
 * Return the list of configured field keys from a config object
 * (without exposing values — safe for API responses).
 */
export function getConfiguredFieldKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).filter(
    (k) => config[k] !== undefined && config[k] !== null && config[k] !== '',
  );
}

/**
 * Mask secret fields in a config, returning a safe-to-display version.
 */
export function maskSecretFields(
  channelType: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const secretKeys = new Set(getSecretFields(channelType));
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (secretKeys.has(k) && typeof v === 'string' && v.length > 0) {
      masked[k] = v.substring(0, 4) + '••••••••';
    } else {
      masked[k] = v;
    }
  }
  return masked;
}
