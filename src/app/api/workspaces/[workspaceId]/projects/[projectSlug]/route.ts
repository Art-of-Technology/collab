import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/request-session';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { issueAccessWhere, issueReadAccessWhere } from '@/lib/issue-finder';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { generateInternalStatusName } from '@/constants/project-statuses';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; projectSlug: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
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
        ...issueAccessWhere(session.user.id).workspace
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Fetch project by slug
    const project = await prisma.project.findFirst({
      where: {
        workspaceId,
        ...issueAccessWhere(userId),
        slug: projectSlug
      },
      include: {
        repository: {
          select: {
            id: true, projectId: true, githubRepoId: true, owner: true, name: true,
            fullName: true, defaultBranch: true, webhookId: true, isActive: true,
            syncedAt: true, createdAt: true, updatedAt: true, developmentBranch: true,
            versioningStrategy: true, branchEnvironmentMap: true, issueTypeMapping: true,
            aiReviewEnabled: true, aiReviewAutoTrigger: true
          }
        },
        statuses: {
          orderBy: {
            order: 'asc'
          }
        },
        _count: {
          select: {
            issues: { where: issueReadAccessWhere(userId) }
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
      isArchived: project.isArchived,
      repository: project.repository, // Include repository data
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
  { params }: { params: Promise<{ workspaceId: string; projectSlug: string }> }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { workspaceId: workspaceSlugOrId, projectSlug } = await params;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid project input' }, { status: 400 });
    }
    
    // Resolve workspace slug/ID to actual workspace ID
    const workspaceId = await resolveWorkspaceSlug(workspaceSlugOrId);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    
    // Verify user has access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        ...issueAccessWhere(session.user.id).workspace
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Get current project
    const currentProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        ...issueAccessWhere(userId),
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

    if ((name !== undefined && (typeof name !== 'string' || !name.trim())) ||
        (description !== undefined && description !== null && typeof description !== 'string') ||
        (keyPrefix !== undefined && typeof keyPrefix !== 'string') ||
        (color !== undefined && typeof color !== 'string') ||
        (statuses !== undefined && (!Array.isArray(statuses) || statuses.some(status =>
          !status || typeof status.id !== 'string' || !status.id.trim() ||
          typeof status.name !== 'string' || !status.name.trim() ||
          typeof status.color !== 'string' ||
          (status.isDefault !== undefined && typeof status.isDefault !== 'boolean'))))) {
      return NextResponse.json({ error: 'Invalid project input' }, { status: 400 });
    }
    if (statuses && new Set(statuses.map((status: { id: string }) => status.id)).size !== statuses.length) {
      return NextResponse.json({ error: 'Duplicate status IDs' }, { status: 400 });
    }

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
      const existingStatuses = statuses === undefined ? [] : await tx.projectStatus.findMany({
        where: { projectId: currentProject.id },
        include: { _count: { select: { issues: true } } }
      });
      const requestedIds = new Set((statuses || []).map((status: { id: string }) => status.id));
      const removed = existingStatuses.filter(status => !requestedIds.has(status.id));
      // Settings saves must not clear issue links; use the explicit move/delete flow.
      if (removed.some(status => status.isDefault || status._count.issues > 0)) return null;
      const internalNames = (statuses || []).map((status: { id: string; name: string }) =>
        existingStatuses.find(existing => existing.id === status.id)?.name ?? generateInternalStatusName(status.name));
      if (internalNames.some((name: string) => !name) || new Set(internalNames).size !== internalNames.length) return null;

      // Update project basic info
      const project = await tx.project.update({
        where: { id: currentProject.id, workspaceId, ...issueAccessWhere(userId) },
        data: {
          name: name || currentProject.name,
          description: description !== undefined ? description : currentProject.description,
          issuePrefix: keyPrefix ? keyPrefix.toUpperCase() : currentProject.issuePrefix,
          color: color || currentProject.color,
        }
      });

      if (statuses !== undefined) {
        if (removed.length) {
          await tx.projectStatus.deleteMany({
            where: { projectId: currentProject.id, id: { in: removed.map(status => status.id) } }
          });
        }
        for (let i = 0; i < statuses.length; i++) {
          const status = statuses[i];
          const existing = existingStatuses.find(row => row.id === status.id);
          if (existing) {
            await tx.projectStatus.update({
              where: { id: existing.id, projectId: currentProject.id },
              data: { displayName: status.name, color: status.color, order: i }
            });
          } else {
            await tx.projectStatus.create({
              data: {
                name: internalNames[i], displayName: status.name, color: status.color, order: i,
                isDefault: status.isDefault || false, isFinal: internalNames[i] === 'done',
                projectId: currentProject.id
              }
            });
          }
        }
      }

      // Return updated project with statuses
      return await tx.project.findUnique({
        where: { id: currentProject.id, workspaceId, ...issueAccessWhere(userId) },
        include: {
          statuses: {
            orderBy: { order: 'asc' }
          },
          _count: {
            select: { issues: { where: issueReadAccessWhere(userId) } }
          }
        }
      });
    });

    if (!updatedProject) {
      return NextResponse.json({ error: 'Statuses changed or cannot be removed; reload settings or move their issues first' }, { status: 409 });
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
      isArchived: updatedProject.isArchived,
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
