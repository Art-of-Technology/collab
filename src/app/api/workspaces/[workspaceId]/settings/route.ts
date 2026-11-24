import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isValidWorkspaceSlug } from '@/lib/url-utils';
import { getWorkspaceAuthority, may } from '@/lib/workspace-authority';
import { z } from 'zod';

const workspaceSettingsSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  slug: z.string().min(1).optional(),
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

    const authority = await getWorkspaceAuthority(session.user.id, workspaceId);
    const missingWorkspace = !authority && !(await prisma.workspace.findUnique({
      where: { id: workspaceId }, select: { id: true },
    }));
    if (missingWorkspace || authority?.level === null) {
      return NextResponse.json(
        { error: 'Workspace not found or insufficient permissions' },
        { status: 404 }
      );
    }
    if (!may(authority, 'workspace.settings')) {
      return NextResponse.json({ error: 'Only Owners can change the workspace settings' }, { status: 403 });
    }

    const validatedData = workspaceSettingsSchema.parse(body);
    const { slug } = validatedData;
    if (slug) {
      const existing = await prisma.workspace.findUnique({ where: { slug }, select: { id: true } });
      if (existing?.id !== workspaceId && !isValidWorkspaceSlug(slug)) {
        return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
      }
      if (existing?.id !== workspaceId && slug === 'docs') {
        return NextResponse.json({ error: 'This slug is reserved for the documentation' }, { status: 400 });
      }
      if (existing && existing.id !== workspaceId) {
        return NextResponse.json({ error: 'A workspace with this slug already exists' }, { status: 409 });
      }
    }

    // Update workspace settings
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: validatedData,
      select: {
        id: true,
        name: true,
        description: true,
        logoUrl: true,
        slug: true,
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