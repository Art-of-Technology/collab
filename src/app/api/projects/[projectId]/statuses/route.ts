import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    
    // Get the project to verify access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { 
        workspaceId: true,
        name: true
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user has access to workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        user: { email: session.user.email },
        workspaceId: project.workspaceId
      }
    });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch project statuses with template information
    const projectStatuses = await prisma.projectStatus.findMany({
      where: {
        projectId,
        isActive: true
      },
      include: {
        template: true,
        _count: {
          select: {
            issues: true
          }
        }
      },
      orderBy: {
        order: 'asc'
      }
    });

    // Transform the data for frontend consumption
    const transformedStatuses = projectStatuses.map(status => ({
      id: status.id,
      name: status.name,
      displayName: status.displayName,
      description: status.description,
      color: status.color,
      iconName: status.iconName,
      order: status.order,
      isDefault: status.isDefault,
      isFinal: status.isFinal,
      issueCount: status._count.issues,
      template: status.template ? {
        id: status.template.id,
        name: status.template.name,
        displayName: status.template.displayName
      } : null
    }));

    return NextResponse.json({ statuses: transformedStatuses });

  } catch (error) {
    console.error('Error fetching project statuses:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    
    const { name, displayName, description, color, iconName, order, isDefault, isFinal, templateId } = body;

    // Get the project to verify access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Verify user has access to workspace
    const hasAccess = await prisma.workspaceMember.findFirst({
      where: {
        user: { email: session.user.email },
        workspaceId: project.workspaceId
      }
    });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // If this is being set as default, unset other defaults
    if (isDefault) {
      await prisma.projectStatus.updateMany({
        where: {
          projectId,
          isDefault: true
        },
        data: {
          isDefault: false
        }
      });
    }

    // Create the new project status
    const newStatus = await prisma.projectStatus.create({
      data: {
        name,
        displayName,
        description,
        color: color || '#6366f1',
        iconName,
        order: order || 0,
        isDefault: isDefault || false,
        isFinal: isFinal || false,
        projectId,
        templateId
      },
      include: {
        template: true,
        _count: {
          select: {
            issues: true
          }
        }
      }
    });

    return NextResponse.json({ status: newStatus }, { status: 201 });

  } catch (error) {
    console.error('Error creating project status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}