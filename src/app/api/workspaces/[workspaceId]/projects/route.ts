import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';

export async function GET(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId } = await params;
    
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

    // Fetch projects (converted from TaskBoards) with issue counts
    const projects = await prisma.project.findMany({
      where: {
        workspaceId
      },
      include: {
        _count: {
          select: {
            issues: true
          }
        }
      },
      orderBy: [
        { isDefault: 'desc' }, // Default projects first
        { updatedAt: 'desc' }
      ]
    });

    // Transform the data for the frontend
    const transformedProjects = projects.map(project => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      issuePrefix: project.issuePrefix,
      color: project.color,
      isDefault: project.isDefault,
      issueCount: project._count.issues,
      activeIssueCount: 0, // TODO: Calculate active issues count
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }));

    return NextResponse.json({ projects: transformedProjects });

  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { workspaceId: string } }
) {
  try {
    const session = await getServerSession(authConfig);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId: workspaceSlugOrId } = await params;
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

    // Get user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate required fields
    const { 
      name, 
      description, 
      color,
      issuePrefix
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' }, 
        { status: 400 }
      );
    }

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    // Check if slug already exists
    const existingProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        slug
      }
    });

    if (existingProject) {
      return NextResponse.json(
        { error: 'A project with this name already exists' }, 
        { status: 400 }
      );
    }

    // Generate issue prefix if not provided
    const finalIssuePrefix = issuePrefix || name.substring(0, 3).toUpperCase();

    // Create the project
    const project = await prisma.project.create({
      data: {
        name,
        slug,
        description,
        color,
        issuePrefix: finalIssuePrefix,
        isDefault: false,
        workspaceId,
        nextIssueNumbers: {
          EPIC: 1,
          STORY: 1,
          TASK: 1,
          DEFECT: 1,
          MILESTONE: 1,
          SUBTASK: 1
        }
      },
      include: {
        _count: {
          select: {
            issues: true
          }
        }
      }
    });

    // Create default view for the project
    await prisma.view.create({
      data: {
        name: `${project.name} Board`,
        description: `Default Kanban view for ${project.name}`,
        displayType: 'KANBAN',
        visibility: 'WORKSPACE',
        color: project.color || '#3b82f6',
        filters: {},
        sorting: { field: 'position', direction: 'asc' },
        grouping: { field: 'status' },
        fields: ['title', 'status', 'priority', 'assignee', 'dueDate'],
        layout: {
          showSubtasks: true,
          showLabels: true,
          showAssigneeAvatars: true
        },
        projectIds: [project.id],
        workspaceIds: [workspaceId],
        isDefault: true,
        isFavorite: false,
        sharedWith: [],
        workspaceId,
        ownerId: user.id
      }
    });

    // Transform the data for the frontend
    const transformedProject = {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      issuePrefix: project.issuePrefix,
      color: project.color,
      isDefault: project.isDefault,
      issueCount: project._count.issues,
      activeIssueCount: 0,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };

    return NextResponse.json({ project: transformedProject }, { status: 201 });

  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 