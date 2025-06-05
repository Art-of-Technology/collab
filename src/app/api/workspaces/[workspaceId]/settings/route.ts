import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const workspaceSettingsSchema = z.object({
  timeTrackingEnabled: z.boolean().optional(),
  dockEnabled: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _params = await params;
    const { workspaceId } = _params;

    // Check if user has access to the workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id } } }
        ]
      },
      select: {
        id: true,
        timeTrackingEnabled: true,
        dockEnabled: true,
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const _params = await params;
    const { workspaceId } = _params;
    const body = await request.json();

    // Validate the request body
    const validatedData = workspaceSettingsSchema.parse(body);

    // Check if user is workspace owner or admin
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ownerId: session.user.id // Only workspace owners can change settings
      }
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found or insufficient permissions' },
        { status: 404 }
      );
    }

    // Update workspace settings
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: validatedData,
      select: {
        id: true,
        timeTrackingEnabled: true,
        dockEnabled: true,
      }
    });

    return NextResponse.json(updatedWorkspace);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error updating workspace settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 