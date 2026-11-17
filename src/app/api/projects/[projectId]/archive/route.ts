import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { revokeProjectRunnerTokens } from '@/lib/agent-runners';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { projectId } = await params;
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid project input' }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as { isArchived?: unknown }).isArchived !== 'boolean') {
      return NextResponse.json({ error: 'Invalid project input' }, { status: 400 });
    }
    const { isArchived } = body as { isArchived: boolean };

    // Update project archive status. An archived project's seats keep no token a runner fetched, and a runner's
    // next ask no longer lists them: both in one transaction, so neither happens without the other.
    const project = await prisma.$transaction(async tx => {
      const updated = await tx.project.update({
        where: {
          id: projectId,
          workspace: postWorkspaceAccessWhere(actor.id),
        },
        data: {
          isArchived: isArchived,
          updatedAt: new Date(),
        },
        include: {
          _count: {
            select: {
              issues: true,
            },
          },
        },
      });
      if (isArchived) await revokeProjectRunnerTokens(tx, updated.workspaceId, actor.id, updated.id);
      return updated;
    });

    return NextResponse.json({
      success: true,
      project,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    console.error('Error updating project archive status:', error);
    return NextResponse.json(
      { error: 'Failed to update project archive status' },
      { status: 500 }
    );
  }
}
