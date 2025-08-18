import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string; projectSlug: string; statusId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, projectSlug, statusId } = await params;
    
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
    const status = await prisma.projectStatus.findFirst({
      where: {
        id: statusId,
        projectId: project.id
      }
    });

    if (!status) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 });
    }

    // Count issues using this status
    const issueCount = await prisma.issue.count({
      where: {
        projectId: project.id,
        statusId: statusId
      }
    });

    return NextResponse.json({ count: issueCount });

  } catch (error) {
    console.error('Error counting issues for status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
