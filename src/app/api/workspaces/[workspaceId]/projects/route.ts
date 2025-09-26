import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { resolveWorkspaceSlug } from '@/lib/slug-resolvers';
import { generateUniqueViewSlug } from '@/lib/utils';

// Function to generate a unique issue prefix within a workspace
async function generateUniqueIssuePrefix(workspaceId: string, requestedPrefix?: string, projectName?: string): Promise<string> {
  // If a specific prefix is requested, validate its uniqueness
  if (requestedPrefix && requestedPrefix.trim()) {
    const cleanPrefix = requestedPrefix.trim().toUpperCase();
    
    // Check if this prefix already exists in the workspace
    const existingProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        issuePrefix: cleanPrefix
      }
    });
    
    if (!existingProject) {
      return cleanPrefix; // Requested prefix is available
    }
  }
  
  // Generate automatic prefix from project name
  if (projectName) {
    const baseName = projectName.trim().toUpperCase();
    
    // Try different strategies to generate a unique prefix
    const strategies = [
      // Strategy 1: First 3 characters
      baseName.substring(0, 3),
      // Strategy 2: First 4 characters  
      baseName.substring(0, 4),
      // Strategy 3: First letter + first letter of each word
      baseName.split(/[\s-_]+/).map(word => word.charAt(0)).join('').substring(0, 4),
      // Strategy 4: Initials (first letter of each word)
      baseName.split(/[\s-_]+/).map(word => word.charAt(0)).join(''),
    ];
    
    // Try each strategy
    for (const basePrefix of strategies) {
      if (basePrefix.length >= 2) { // Minimum 2 characters
        // Try the base prefix first
        const existingProject = await prisma.project.findFirst({
          where: {
            workspaceId,
            issuePrefix: basePrefix
          }
        });
        
        if (!existingProject) {
          return basePrefix;
        }
        
        // If base prefix exists, try with numbers
        for (let i = 1; i <= 99; i++) {
          const numberedPrefix = `${basePrefix}${i}`;
          const existingNumberedProject = await prisma.project.findFirst({
            where: {
              workspaceId,
              issuePrefix: numberedPrefix
            }
          });
          
          if (!existingNumberedProject) {
            return numberedPrefix;
          }
        }
      }
    }
  }
  
  // Fallback: Generate random prefix
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 100; attempt++) {
    let randomPrefix = '';
    for (let i = 0; i < 3; i++) {
      randomPrefix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    const existingProject = await prisma.project.findFirst({
      where: {
        workspaceId,
        issuePrefix: randomPrefix
      }
    });
    
    if (!existingProject) {
      return randomPrefix;
    }
  }
  
  throw new Error('Unable to generate unique issue prefix');
}

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
    
    // Verify user has access to workspace (must be owner or ACTIVE member)
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: (session.user as any).id },
          { members: { some: { userId: (session.user as any).id, status: true } } }
        ]
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
      isArchived: project.isArchived,
      issueCount: project._count.issues,
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

    // Generate unique issue prefix
    let finalIssuePrefix: string;
    try {
      finalIssuePrefix = await generateUniqueIssuePrefix(workspaceId, issuePrefix, name);
    } catch (error) {
      return NextResponse.json(
        { error: 'Unable to generate unique issue prefix. Please try a different project name or specify a custom prefix.' }, 
        { status: 400 }
      );
    }

    // Create the project and its default statuses in a transaction
    const project = await prisma.$transaction(async (tx) => {
      // Create the project
      const newProject = await tx.project.create({
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
            BUG: 1,
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

      // Get the default statuses from the projects StatusTemplate table
      const defaultStatuses = await prisma.statusTemplate.findMany({
        where: {
          isDefault: true,
        }
      });

      // Create the project statuses
      await tx.projectStatus.createMany({
        data: defaultStatuses.map(status => ({
          name: status.name,
          displayName: status.displayName,
          color: status.color,
          order: status.order,
          isDefault: status.isDefault,
          isFinal: false,
          iconName: status.iconName,
          projectId: newProject.id
        }))
      });

      return newProject;
    });

    // Create default view for the project
    const viewName = `${project.name}: Default`;
    
    // Generate unique slug for the view
    const viewSlugChecker = async (slug: string, workspaceId: string) => {
      const existingView = await prisma.view.findFirst({
        where: { slug, workspaceId }
      });
      return !!existingView;
    };

    const viewSlug = await generateUniqueViewSlug(viewName, workspaceId, viewSlugChecker);
    
    await prisma.view.create({
      data: {
        name: viewName,
        slug: viewSlug,
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
      isArchived: project.isArchived,
      issueCount: project._count.issues,
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