/**
 * Third-Party App API: User Profile Endpoints
 * GET /api/apps/auth/user/me - Get current user profile
 * PATCH /api/apps/auth/user/me - Update current user profile
 * 
 * Required scopes:
 * - user:read or profile:read for GET
 * - user:write or profile:write for PATCH
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { withAppAuth, AppAuthContext } from '@/lib/apps/auth-middleware';
import { z } from 'zod';

const prisma = new PrismaClient();

// Schema for user profile updates
const UpdateUserProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  team: z.string().max(100).optional(),
  currentFocus: z.string().max(200).optional(),
  expertise: z.array(z.string()).optional(),
  // Avatar customization fields
  avatarAccessory: z.number().int().min(0).optional(),
  avatarBrows: z.number().int().min(0).optional(),
  avatarEyes: z.number().int().min(0).optional(),
  avatarEyewear: z.number().int().min(0).optional(),
  avatarHair: z.number().int().min(0).optional(),
  avatarMouth: z.number().int().min(0).optional(),
  avatarNose: z.number().int().min(0).optional(),
  avatarSkinTone: z.number().int().min(0).optional(),
  useCustomAvatar: z.boolean().optional(),
  // Note: email updates should go through a separate verification flow
});

/**
 * GET /api/apps/auth/user/me
 * Get current user profile information
 */
export const GET = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      // Get detailed user information
      const user = await prisma.user.findUnique({
        where: { id: context.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          team: true,
          currentFocus: true,
          expertise: true,
          role: true,
          avatarAccessory: true,
          avatarBrows: true,
          avatarEyes: true,
          avatarEyewear: true,
          avatarHair: true,
          avatarMouth: true,
          avatarNose: true,
          avatarSkinTone: true,
          useCustomAvatar: true,
          createdAt: true,
          updatedAt: true,
          // Include workspace membership in current workspace
          workspaceMemberships: {
            where: { workspaceId: context.workspace.id },
            select: {
              role: true,
              createdAt: true,
              status: true
            }
          }
        }
      });

      if (!user) {
        return NextResponse.json(
          { error: 'user_not_found', error_description: 'User not found' },
          { status: 404 }
        );
      }

      const workspaceMember = user.workspaceMemberships[0];

      const response = {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        team: user.team,
        currentFocus: user.currentFocus,
        expertise: user.expertise,
        role: user.role,
        avatar: {
          accessory: user.avatarAccessory,
          brows: user.avatarBrows,
          eyes: user.avatarEyes,
          eyewear: user.avatarEyewear,
          hair: user.avatarHair,
          mouth: user.avatarMouth,
          nose: user.avatarNose,
          skinTone: user.avatarSkinTone,
          useCustom: user.useCustomAvatar
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        workspace: {
          id: context.workspace.id,
          slug: context.workspace.slug,
          name: context.workspace.name,
          role: workspaceMember?.role,
          joinedAt: workspaceMember?.createdAt,
          status: workspaceMember?.status
        }
      };

      return NextResponse.json(response);

    } catch (error) {
      console.error('Error fetching user profile:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['user:read', 'profile:read'] } // Either scope is sufficient
);

/**
 * PATCH /api/apps/auth/user/me
 * Update current user profile information
 */
export const PATCH = withAppAuth(
  async (request: NextRequest, context: AppAuthContext) => {
    try {
      const body = await request.json();
      const updateData = UpdateUserProfileSchema.parse(body);

      // Update user profile
      const updatedUser = await prisma.user.update({
        where: { id: context.user.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          team: true,
          currentFocus: true,
          expertise: true,
          role: true,
          avatarAccessory: true,
          avatarBrows: true,
          avatarEyes: true,
          avatarEyewear: true,
          avatarHair: true,
          avatarMouth: true,
          avatarNose: true,
          avatarSkinTone: true,
          useCustomAvatar: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return NextResponse.json(updatedUser);

    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { 
            error: 'validation_error', 
            error_description: 'Invalid request data',
            details: error.errors
          },
          { status: 400 }
        );
      }

      console.error('Error updating user profile:', error);
      return NextResponse.json(
        { error: 'server_error', error_description: 'Internal server error' },
        { status: 500 }
      );
    } finally {
      await prisma.$disconnect();
    }
  },
  { requiredScopes: ['user:write', 'profile:write'] } // Either scope is sufficient
);
