import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { postWorkspaceAccessWhere } from '@/lib/post-access';
import { issueReadAccessWhere } from '@/lib/issue-finder';
import { prisma } from '@/lib/prisma';

class StatusAccessChanged extends Error {}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    
    // Get the exact project under current owner or active-member access.
    const projectWhere = { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) };
    const project = await prisma.project.findFirst({
      where: projectWhere,
      select: { 
        workspaceId: true,
        name: true
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Fetch project statuses with template information
    const projectStatuses = await prisma.projectStatus.findMany({
      where: {
        projectId,
        project: projectWhere,
        isActive: true
      },
      include: {
        template: true,
        _count: {
          select: {
            issues: { where: { projectId, workspaceId: project.workspaceId, AND: [issueReadAccessWhere(actor.id)] } }
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

    return NextResponse.json({ statuses: transformedStatuses }, { headers: { "Cache-Control": "no-store" } });

  } catch {
    console.error('Error fetching project statuses');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await request.json();
    
    const { name, displayName, description, color, iconName, order, isDefault, isFinal, templateId } = body;

    // Get the exact project under current owner or active-member access.
    const projectWhere = { id: projectId, workspace: postWorkspaceAccessWhere(actor.id) };
    const project = await prisma.project.findFirst({
      where: projectWhere,
      select: { workspaceId: true }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const newStatus = await prisma.$transaction(async (tx) => {
      if (!await tx.project.findFirst({ where: projectWhere, select: { id: true } })) {
        throw new StatusAccessChanged();
      }
      // If this is being set as default, unset other defaults
      if (isDefault) {
        await tx.projectStatus.updateMany({
          where: {
            projectId,
            project: projectWhere,
            isDefault: true
          },
          data: {
            isDefault: false
          }
        });
      }

      // Create the new project status
      return await tx.projectStatus.create({
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
              issues: { where: { projectId, workspaceId: project.workspaceId, AND: [issueReadAccessWhere(actor.id)] } }
            }
          }
        }
      });
    });

    return NextResponse.json({ status: newStatus }, { status: 201, headers: { "Cache-Control": "no-store" } });

  } catch (error) {
    if (error instanceof StatusAccessChanged) {
      return NextResponse.json({ error: 'Project access changed' }, { status: 409 });
    }
    console.error('Error creating project status');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}