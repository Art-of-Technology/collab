import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { generateInternalStatusName } from '@/constants/project-statuses';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string; projectSlug: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
    
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

    // Fetch project by slug
    const project = await prisma.project.findFirst({
      where: {
        workspaceId,
        slug: projectSlug
      },
      include: {
        statuses: {
          orderBy: {
            order: 'asc'
          }
        },
        _count: {
          select: {
            issues: true
          }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Transform the data for the frontend
    const transformedProject = {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      keyPrefix: project.issuePrefix,
      color: project.color,
      isDefault: project.isDefault,
      statuses: project.statuses.map(status => ({
        id: status.id,
        name: status.displayName,
        color: status.color,
        order: status.order,
        isDefault: status.isDefault
      })),
      issueCount: project._count.issues,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };

    return NextResponse.json({ project: transformedProject });

  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { workspaceId: string; projectSlug: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
    const body = await request.json();
    
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

    // Get current project
    const currentProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        slug: projectSlug
      }
    });

    if (!currentProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { 
      name, 
      description, 
      keyPrefix,
      color,
      statuses
    } = body;

    // Validate keyPrefix uniqueness if it changed
    if (keyPrefix && keyPrefix !== currentProject.issuePrefix) {
      const existingProject = await prisma.project.findFirst({
        where: {
          workspaceId,
          issuePrefix: keyPrefix.toUpperCase(),
          NOT: { id: currentProject.id }
        }
      });

      if (existingProject) {
        return NextResponse.json(
          { error: 'Issue prefix already exists in this workspace' }, 
          { status: 400 }
        );
      }
    }

    // Update project in a transaction
    const updatedProject = await prisma.$transaction(async (tx) => {
      // Update project basic info
      const project = await tx.project.update({
        where: { id: currentProject.id },
        data: {
          name: name || currentProject.name,
          description: description !== undefined ? description : currentProject.description,
          issuePrefix: keyPrefix ? keyPrefix.toUpperCase() : currentProject.issuePrefix,
          color: color || currentProject.color,
        }
      });

      // Handle statuses if provided
      if (statuses && Array.isArray(statuses)) {
        // Delete existing statuses
        await tx.projectStatus.deleteMany({
          where: { projectId: currentProject.id }
        });

        // Create new statuses
        if (statuses.length > 0) {
          for (let i = 0; i < statuses.length; i++) {
            const status = statuses[i];
            
            // Generate internal name if it's a new temporary status
            let internalName: string;
            if (status.id.startsWith('status-') || status.name) {
              // New status - generate internal name from display name using utility
              internalName = generateInternalStatusName(status.name);
            } else {
              // Existing status - use existing ID as internal name
              internalName = status.id;
            }
            
            await tx.projectStatus.create({
              data: {
                name: internalName,
                displayName: status.name,
                color: status.color,
                order: i,
                isDefault: status.isDefault || false,
                isFinal: status.id === 'done' || internalName === 'done',
                projectId: currentProject.id
              }
            });
          }
        }
      }

      // Return updated project with statuses
      return await tx.project.findUnique({
        where: { id: currentProject.id },
        include: {
          statuses: {
            orderBy: { order: 'asc' }
          },
          _count: {
            select: { issues: true }
          }
        }
      });
    });

    if (!updatedProject) {
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }

    // Transform the data for the frontend
    const transformedProject = {
      id: updatedProject.id,
      name: updatedProject.name,
      slug: updatedProject.slug,
      description: updatedProject.description,
      keyPrefix: updatedProject.issuePrefix,
      color: updatedProject.color,
      isDefault: updatedProject.isDefault,
      statuses: updatedProject.statuses.map(status => ({
        id: status.id,
        name: status.displayName,
        color: status.color,
        order: status.order,
        isDefault: status.isDefault
      })),
      issueCount: updatedProject._count.issues,
      createdAt: updatedProject.createdAt,
      updatedAt: updatedProject.updatedAt
    };

    return NextResponse.json({ project: transformedProject });

  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
