/**
 * Third-Party App API: GitHub Token Endpoint
 * GET /api/apps/auth/github/token - Returns decrypted GitHub access token for the user
 *
 * Used by Coclaw (via MCP) to get the user's GitHub OAuth token for git operations.
 * The token is decrypted from the user's stored encrypted githubAccessToken field.
 *
 * Required scopes: (none — user-level, token holder is the user)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { EncryptionService } from '@/lib/encryption';

export const GET = withAppAuth(
  async (_request: NextRequest, context: AppAuthContext) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: {
          githubAccessToken: true,
          name: true,
          email: true,
        },
      });

      if (!user?.githubAccessToken) {
        return NextResponse.json(
          {
            connected: false,
            error: 'GitHub account not connected. Please connect your GitHub account from the platform settings.',
          },
          { status: 404 }
        );
      }

      // Decrypt the token
      const accessToken = EncryptionService.decrypt(user.githubAccessToken);

      return NextResponse.json({
        connected: true,
        token: accessToken,
        user: {
          name: user.name,
          email: user.email,
        },
      });
    } catch (error) {
      console.error('GitHub token endpoint error:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve GitHub token' },
        { status: 500 }
      );
    }
  }
);
