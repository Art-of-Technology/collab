import { assertNoRetainedIssues, IssueTrashError } from '@/lib/issue-trash';
import { Prisma } from '@prisma/client';
import { assertLegacyWorkspaceDeleteAllowed, ForgeProjectWriteError } from '@/lib/forge/legacy-write-guard';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { isValidWorkspaceSlug } from '@/lib/url-utils';
import { getWorkspaceAuthority, may } from '@/lib/workspace-authority';

// GET /api/workspaces/[workspaceId] - Get workspace details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const _params = await params;
    const { workspaceId } = _params;

    // Try to find by slug first, then by ID for backward compatibility
    let workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
              }
            }
          }
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          }
        }
      }
    });

    // If not found by slug, try by ID for backward compatibility
    if (!workspace) {
      workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  image: true,
                  role: true,
                }
              }
            }
          },
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
              role: true,
            }
          }
        }
      });
    }

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Check if user is an ACTIVE member or owner
    const isMember = workspace.ownerId === currentUser.id ||
      workspace.members.some(member => member.userId === currentUser.id && member.status === true);

    if (!isMember) {
      return NextResponse.json(
        { error: 'You do not have access to this workspace' },
        { status: 403 }
      );
    }

    return NextResponse.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workspace' },
      { status: 500 }
    );
  }
}

// PATCH /api/workspaces/[workspaceId] - Update workspace
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const _params = await params;
    const { workspaceId } = _params;
    const body = await request.json();

    // Check if workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Owners change the settings. A platform admin who is not a member keeps the answer this route gave before.
    const authority = await getWorkspaceAuthority(currentUser.id, workspaceId);
    if (authority?.level !== null && !may(authority, 'workspace.settings')) {
      return NextResponse.json(
        { error: 'Only Owners can change the workspace settings' },
        { status: 403 }
      );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
    }
    const { name, description, logoUrl, slug, dockEnabled, timeTrackingEnabled } = body;
    if ((name !== undefined && (typeof name !== 'string' || !name)) ||
        (description != null && typeof description !== 'string') ||
        (logoUrl != null && typeof logoUrl !== 'string') ||
        (slug !== undefined && (typeof slug !== 'string' || !slug)) ||
        (dockEnabled !== undefined && typeof dockEnabled !== 'boolean') ||
        (timeTrackingEnabled !== undefined && typeof timeTrackingEnabled !== 'boolean')) {
      return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
    }
    if (slug && slug !== workspace.slug) {
      if (!isValidWorkspaceSlug(slug)) {
        return NextResponse.json({ error: 'Invalid workspace settings' }, { status: 400 });
      }
      if (slug === 'docs') {
        return NextResponse.json({ error: 'This slug is reserved for the documentation' }, { status: 400 });
      }
      if (await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) {
        return NextResponse.json({ error: 'A workspace with this slug already exists' }, { status: 409 });
      }
    }

    // Update workspace
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        slug,
        dockEnabled,
        timeTrackingEnabled,
        name,
        description,
        logoUrl,
      }
    });

    return NextResponse.json(updatedWorkspace);
  } catch (error) {
    console.error('Error updating workspace:', error);
    return NextResponse.json(
      { error: 'Failed to update workspace' },
      { status: 500 }
    );
  }
}

// DELETE /api/workspaces/[workspaceId] - Delete workspace
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const _params = await params;
    const { workspaceId } = _params;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }

    // Only the primary owner deletes. A platform admin who is not a member keeps the answer this route gave before.
    const authority = await getWorkspaceAuthority(currentUser.id, workspaceId);
    if (authority?.level !== null && !may(authority, 'workspace.delete')) {
      return NextResponse.json(
        { error: 'Only the primary owner can delete the workspace' },
        { status: 403 }
      );
    }

    await assertLegacyWorkspaceDeleteAllowed(workspaceId);
    await assertNoRetainedIssues({ OR: [{ workspaceId }, { project: { workspaceId } }] });

    // Delete workspace and all related data
    await prisma.workspace.delete({
      where: { id: workspaceId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof IssueTrashError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return NextResponse.json({ error: 'Workspace still contains protected records; reload and retry' }, { status: 409 });
    if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error deleting workspace:', error);
    return NextResponse.json(
      { error: 'Failed to delete workspace' },
      { status: 500 }
    );
  }
} 