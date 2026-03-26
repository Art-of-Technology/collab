/**
 * MCP API: Coclaw Channel Configuration — Single Channel
 * DELETE /api/apps/auth/coclaw/channels/[channelType] — Remove a channel
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, type AppAuthContext } from '@/lib/apps/auth-middleware';

/**
 * DELETE /api/apps/auth/coclaw/channels/[channelType]
 * Remove a channel configuration entirely.
 */
export const DELETE = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext, routeParams: { params: Promise<{ channelType: string }> }) => {
    try {
      const { channelType } = await routeParams.params;

      const deleted = await prisma.coclawChannelConfig.deleteMany({
        where: {
          userId: context.user.id,
          workspaceId: context.workspace.id,
          channelType,
        },
      });

      if (deleted.count === 0) {
        return NextResponse.json(
          { error: `Channel ${channelType} not configured` },
          { status: 404 },
        );
      }

      return NextResponse.json({
        message: `Channel ${channelType} removed. Restart your Coclaw instance to apply.`,
      });
    } catch (error) {
      console.error('[Coclaw MCP] Error removing channel:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
  { requiredScopes: 'context:write' },
);
