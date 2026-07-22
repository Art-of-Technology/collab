/**
 * MCP API: Coclaw Activity Reporting
 * POST /api/apps/auth/coclaw/activity — Report autonomous Coclaw actions
 *
 * Called by the Coclaw daemon (via MCP token auth) to report actions it took
 * autonomously — e.g. responding to a Slack message, updating memory,
 * completing a scheduled task, etc.
 *
 * Creates a notification so the user sees "Coclaw did X" when they return.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAppAuth, type AppAuthContext } from '@/lib/apps/auth-middleware';
import {
  createCoclawNotification,
  CoclawNotificationType,
} from '@/lib/coclaw/notifications';

const VALID_TYPES: Record<string, CoclawNotificationType> = {
  response: CoclawNotificationType.COCLAW_RESPONSE,
  tool_action: CoclawNotificationType.COCLAW_TOOL_ACTION,
  channel_event: CoclawNotificationType.COCLAW_CHANNEL_EVENT,
  memory_update: CoclawNotificationType.COCLAW_MEMORY_UPDATE,
  error: CoclawNotificationType.COCLAW_ERROR,
};

export const POST = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const { type, content } = body as {
        type?: string;
        content?: string;
      };

      if (!type || !content) {
        return NextResponse.json(
          { error: 'type and content are required' },
          { status: 400 },
        );
      }

      const notificationType = VALID_TYPES[type];
      if (!notificationType) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${Object.keys(VALID_TYPES).join(', ')}` },
          { status: 400 },
        );
      }

      // Truncate content to 500 chars max
      const safeContent = content.length > 500
        ? content.substring(0, 497) + '...'
        : content;

      await createCoclawNotification({
        userId: context.user.id,
        type: notificationType,
        content: safeContent,
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('[coclaw/activity] Error:', error);
      return NextResponse.json(
        { error: 'Failed to report activity' },
        { status: 500 },
      );
    }
  },
  { requiredScopes: ['context:write'] },
);
