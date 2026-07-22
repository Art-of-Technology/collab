import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const ToggleSystemAppSchema = z.object({
  isSystemApp: z.boolean()
});

/**
 * PATCH /api/apps/by-id/[id]/system-app - Toggle system app status
 * Only SYSTEM_ADMIN can mark/unmark apps as system apps
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only SYSTEM_ADMIN can manage system apps
    if (session.user.role !== 'SYSTEM_ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden - Only system administrators can manage system apps' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = ToggleSystemAppSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { isSystemApp } = validation.data;

    // Get the app
    const app = await prisma.app.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isSystemApp: true
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    // Only allow marking PUBLISHED apps as system apps
    if (isSystemApp && app.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Only published apps can be marked as system apps' },
        { status: 400 }
      );
    }

    // Update the app
    const updatedApp = await prisma.app.update({
      where: { id },
      data: { isSystemApp },
      select: {
        id: true,
        name: true,
        slug: true,
        isSystemApp: true
      }
    });

    console.log(`🔧 System App: ${isSystemApp ? 'Enabled' : 'Disabled'} for ${app.name}`, {
      appId: app.id,
      appSlug: app.slug,
      adminUserId: session.user.id,
      previousValue: app.isSystemApp,
      newValue: isSystemApp
    });

    await prisma.$disconnect();

    return NextResponse.json({
      success: true,
      message: isSystemApp
        ? `${app.name} is now a system app and available to all workspaces`
        : `${app.name} is no longer a system app`,
      app: updatedApp
    });

  } catch (error) {
    console.error('Error toggling system app status:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/apps/by-id/[id]/system-app - Get system app status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const app = await prisma.app.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        isSystemApp: true,
        status: true
      }
    });

    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    await prisma.$disconnect();

    return NextResponse.json({
      isSystemApp: app.isSystemApp,
      canBeSystemApp: app.status === 'PUBLISHED'
    });

  } catch (error) {
    console.error('Error getting system app status:', error);
    await prisma.$disconnect();
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
