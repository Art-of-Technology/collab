import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { workspaceId: string; projectSlug: string; statusId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, projectSlug, statusId } = await params;
    const body = await request.json();
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
        members: {
          some: {
            user: {
              email: session.user.email
            }
          }
        }
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get project
    const project = await prisma.project.findFirst({
      where: {
        workspaceId,
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
        projectId: project.id
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

    // Perform the deletion in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // First, move all issues to the target status if specified
      if (targetStatusId) {
        const updatedIssues = await tx.issue.updateMany({
          where: {
            projectId: project.id,
            statusId: statusId
          },
          data: {
            statusId: targetStatusId
          }
        });

        console.log(`Moved ${updatedIssues.count} issues from status ${statusId} to ${targetStatusId}`);
      }

      // Then delete the status
      const deletedStatus = await tx.projectStatus.delete({
        where: {
          id: statusId
        }
      });

      return {
        deletedStatus,
        movedIssuesCount: targetStatusId ? await tx.issue.count({
          where: {
            projectId: project.id,
            statusId: targetStatusId
          }
        }) : 0
      };
    });

    return NextResponse.json({ 
      success: true, 
      message: `Status deleted${targetStatusId ? ` and issues moved to target status` : ''}`,
      deletedStatus: result.deletedStatus,
      movedIssuesCount: result.movedIssuesCount
    });

  } catch (error) {
    console.error('Error deleting status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
