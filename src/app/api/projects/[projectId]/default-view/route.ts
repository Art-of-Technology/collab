import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/request-session';
import { authConfig } from '@/lib/auth';
import { issueAccessWhere } from '@/lib/issue-finder';
import { viewReadAccessWhere } from '@/lib/view-access';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, ...issueAccessWhere(session.user.id) },
      select: { workspaceId: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const defaultView = await prisma.view.findFirst({
      where: {
        workspaceId: project.workspaceId,
        projectIds: { has: projectId },
        isDefault: true,
        ...viewReadAccessWhere(session.user.id)
      },
      select: {
        id: true,
        slug: true,
        name: true
      }
    });

    if (!defaultView) {
      return NextResponse.json({ error: 'No default view found' }, { status: 404 });
    }

    return NextResponse.json({
      id: defaultView.id,
      slug: defaultView.slug,
      name: defaultView.name
    });

  } catch (error) {
    console.error('Error finding default view for project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
