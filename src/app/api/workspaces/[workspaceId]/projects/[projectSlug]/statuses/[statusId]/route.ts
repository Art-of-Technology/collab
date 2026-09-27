import { ForgeProjectWriteError, assertLegacyProjectWriteAllowed } from '@/lib/forge/legacy-write-guard';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; projectSlug: string; statusId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { workspaceId: workspaceSlugOrId, projectSlug, statusId } = await params;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        (body.targetStatusId !== undefined && (typeof body.targetStatusId !== 'string' || !body.targetStatusId.trim()))) {
      return NextResponse.json({ error: 'Invalid target status' }, { status: 400 });
    }
    const { targetStatusId } = body;
    
    // Resolve workspace slug/ID to actual workspace ID
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    
    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ...issueAccessWhere(userId).workspace
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get project
    const project = await prisma.project.findFirst({
      where: {
        workspaceId,
        ...issueAccessWhere(userId),
        slug: projectSlug
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify status belongs to project
    const statusToDelete = await prisma.projectStatus.findFirst({
      where: {
        id: statusId,
        projectId: project.id,
        project: issueAccessWhere(userId)
      }
    });

    if (!statusToDelete) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 });
    }

    // Prevent deletion of default statuses
    if (statusToDelete.isDefault) {
      return NextResponse.json({ error: 'Cannot delete default status' }, { status: 400 });
    }

    // If targetStatusId is provided, verify it exists and belongs to the same project
    if (targetStatusId) {
      const targetStatus = await prisma.projectStatus.findFirst({
        where: {
          id: targetStatusId,
          projectId: project.id
        }
      });

      if (!targetStatus) {
        return NextResponse.json({ error: 'Target status not found' }, { status: 400 });
      }

      if (targetStatus.id === statusId) {
        return NextResponse.json({ error: 'Cannot move issues to the same status being deleted' }, { status: 400 });
      }
    }

    await assertLegacyProjectWriteAllowed(project.id);

    // Perform the deletion in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Recheck source and target at transaction entry before touching issues.
      const source = await tx.projectStatus.findFirst({
        where: { id: statusId, projectId: project.id, isDefault: false, project: issueAccessWhere(userId) }
      });
      if (!source) return null;
      if (targetStatusId && !await tx.projectStatus.findFirst({
        where: { id: targetStatusId, projectId: project.id, project: issueAccessWhere(userId) }
      })) return null;

      const movableWhere = { workspaceId, projectId: project.id, statusId, ...issueReadAccessWhere(userId) };
      // The FK clears every attached issue, including malformed cross-project links.
      const attached = await tx.issue.count({ where: { statusId } });
      const movable = await tx.issue.count({ where: movableWhere });
      if (attached !== movable || (attached > 0 && !targetStatusId)) return null;

      let movedIssuesCount = 0;
      if (targetStatusId) {
        const moved = await tx.issue.updateMany({ where: movableWhere, data: { statusId: targetStatusId } });
        movedIssuesCount = moved.count;
      }
      const deletedStatus = await tx.projectStatus.delete({
        where: {
          id: statusId, projectId: project.id, isDefault: false,
          project: issueAccessWhere(userId), issues: { none: {} }
        }
      });
      return { deletedStatus, movedIssuesCount };
    });

    if (!result) {
      return NextResponse.json({ error: 'Status changed or has issues that cannot be moved; reload and choose a valid target' }, { status: 409 });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Status deleted${targetStatusId ? ` and issues moved to target status` : ''}`,
      deletedStatus: result.deletedStatus,
      movedIssuesCount: result.movedIssuesCount
    });

  } catch (error) {
    if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('Error deleting status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
