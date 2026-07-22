/**
 * MCP API: Coclaw Channel Configuration
 * GET  /api/apps/auth/coclaw/channels — List configured channels
 * POST /api/apps/auth/coclaw/channels — Configure a channel
 *
 * These endpoints allow Coclaw to manage its own channels via conversation.
 * "Hey Coclaw, connect my Telegram bot with token XYZ" triggers these.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, type AppAuthContext } from '@/lib/apps/auth-middleware';
import { encryptVariable, decryptVariable } from '@/lib/secrets/crypto';
import { validateChannelConfig, VALID_CHANNEL_TYPES, maskSecretFields } from '@/lib/coclaw/channel-types';
import { SUPPORTED_CHANNELS } from '@/lib/coclaw/types';

/**
 * GET /api/apps/auth/coclaw/channels
 * List all channel configurations for the current user+workspace.
 */
export const GET = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext) => {
    try {
      const configs = await prisma.coclawChannelConfig.findMany({
        where: {
          userId: context.user.id,
          workspaceId: context.workspace.id,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const channels = configs.map((c) => {
        let maskedConfig: Record<string, unknown> = {};
        try {
          const decrypted = decryptVariable(c.config, context.workspace.id);
          const parsed = JSON.parse(decrypted) as Record<string, unknown>;
          maskedConfig = maskSecretFields(c.channelType, parsed);
        } catch {
          // Config decryption failed — still return metadata
        }

        return {
          channelType: c.channelType,
          enabled: c.enabled,
          status: c.status,
          lastError: c.lastError,
          config: maskedConfig,
          updatedAt: c.updatedAt.toISOString(),
        };
      });

      // Include unconfigured channel types for discoverability
      const configuredTypes = new Set(configs.map((c) => c.channelType));
      const available = SUPPORTED_CHANNELS
        .filter((ch) => !configuredTypes.has(ch.type))
        .map((ch) => ({
          channelType: ch.type,
          name: ch.name,
          description: ch.description,
          fields: ch.fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            description: f.description,
            placeholder: f.placeholder,
          })),
        }));

      return NextResponse.json({ channels, available });
    } catch (error) {
      console.error('[Coclaw MCP] Error listing channels:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { requiredScopes: 'context:read' },
);

/**
 * POST /api/apps/auth/coclaw/channels
 * Create or update a channel configuration.
 * Body: { channelType: string, config: Record<string, unknown>, enabled?: boolean }
 */
export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const { channelType, config, enabled = true } = body as {
        channelType: string;
        config: Record<string, unknown>;
        enabled?: boolean;
      };

      if (!channelType || !VALID_CHANNEL_TYPES.has(channelType)) {
        return NextResponse.json(
          { error: `Invalid channel type: ${channelType}. Supported: ${[...VALID_CHANNEL_TYPES].join(', ')}` },
          { status: 400 },
        );
      }

      if (!config || typeof config !== 'object') {
        return NextResponse.json({ error: 'config must be an object' }, { status: 400 });
      }

      // Validate required fields
      const errors = validateChannelConfig(channelType, config);
      if (errors.length > 0) {
        return NextResponse.json({ error: 'Validation failed', details: errors }, { status: 400 });
      }

      // Encrypt and store
      const encryptedConfig = encryptVariable(JSON.stringify(config), context.workspace.id);

      const result = await prisma.coclawChannelConfig.upsert({
        where: {
          userId_workspaceId_channelType: {
            userId: context.user.id,
            workspaceId: context.workspace.id,
            channelType,
          },
        },
        create: {
          userId: context.user.id,
          workspaceId: context.workspace.id,
          channelType,
          config: encryptedConfig,
          enabled,
          status: 'DISCONNECTED',
        },
        update: {
          config: encryptedConfig,
          enabled,
          status: 'DISCONNECTED',
          lastError: null,
        },
      });

      return NextResponse.json({
        channelType: result.channelType,
        enabled: result.enabled,
        status: result.status,
        message: `Channel ${channelType} configured. Restart your Coclaw instance to apply.`,
      });
    } catch (error) {
      console.error('[Coclaw MCP] Error configuring channel:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { requiredScopes: 'context:write' },
);
