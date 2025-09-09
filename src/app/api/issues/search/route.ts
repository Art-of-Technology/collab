import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET /api/issues/search - Search issues for mentions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const workspaceId = searchParams.get('workspace');
    const types = searchParams.getAll('type'); // Can have multiple type filters
    const projects = searchParams.getAll('project'); // Can have multiple project filters

    // Build base where clause
    const whereClause: any = {};

    // Add workspace filter if provided
    if (workspaceId) {
      // Resolve workspace by ID or slug and verify access
      const workspace = await prisma.workspace.findFirst({
        where: {
          AND: [
            {
              OR: [
                { id: workspaceId },
                { slug: workspaceId }
              ]
            },
            {
              OR: [
                { ownerId: session.user.id },
                { members: { some: { userId: session.user.id } } }
              ]
            }
          ]
        },
        select: { id: true }
      });
      
      if (!workspace) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
      
      whereClause.workspaceId = workspace.id;
    } else {
      // If no workspace specified, find all workspaces user has access to
      const accessibleWorkspaces = await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: session.user.id },
            { members: { some: { userId: session.user.id } } },
          ],
        },
        select: { id: true },
      });
      
      whereClause.workspaceId = {
        in: accessibleWorkspaces.map(w => w.id)
      };
    }

    // Add type filter if provided
    if (types.length > 0) {
      whereClause.type = {
        in: types
      };
    }

    // Add project filter if provided
    if (projects.length > 0) {
      whereClause.projectId = {
        in: projects
      };
    }

    let allIssues: any[] = [];
    
    if (query.trim()) {
      const includeClause = {
        project: {
          select: {
            id: true,
            name: true,
            slug: true,
            issuePrefix: true,
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          }
        },
        assignee: {
          select: {
            id: true,
            name: true,
            image: true
          }
        }
      };

      // 1. Exact issueKey matches (highest priority)
      const exactIssueKeyMatches = await prisma.issue.findMany({
        where: {
          ...whereClause,
          issueKey: {
            equals: query,
            mode: 'insensitive'
          }
        },
        include: includeClause,
        take: 10
      });

      // 2. Partial issueKey matches (if we don't have enough exact matches)
      let partialIssueKeyMatches: any[] = [];
      if (exactIssueKeyMatches.length < 10) {
        partialIssueKeyMatches = await prisma.issue.findMany({
          where: {
            ...whereClause,
            issueKey: {
              contains: query,
              mode: 'insensitive'
            },
            NOT: {
              id: { in: exactIssueKeyMatches.map(issue => issue.id) }
            }
          },
          include: includeClause,
          take: 10 - exactIssueKeyMatches.length
        });
      }

      // 3. Title matches (if we still need more results)
      let titleMatches: any[] = [];
      const currentCount = exactIssueKeyMatches.length + partialIssueKeyMatches.length;
      if (currentCount < 10) {
        const existingIds = [...exactIssueKeyMatches, ...partialIssueKeyMatches].map(issue => issue.id);
        titleMatches = await prisma.issue.findMany({
          where: {
            ...whereClause,
            title: {
              contains: query,
              mode: 'insensitive'
            },
            NOT: {
              id: { in: existingIds }
            }
          },
          include: includeClause,
          take: 10 - currentCount
        });
      }

      // 4. Description matches (if we still need more results)
      let descriptionMatches: any[] = [];
      const finalCount = exactIssueKeyMatches.length + partialIssueKeyMatches.length + titleMatches.length;
      if (finalCount < 10) {
        const existingIds = [...exactIssueKeyMatches, ...partialIssueKeyMatches, ...titleMatches].map(issue => issue.id);
        descriptionMatches = await prisma.issue.findMany({
          where: {
            ...whereClause,
            description: {
              contains: query,
              mode: 'insensitive'
            },
            NOT: {
              id: { in: existingIds }
            }
          },
          include: includeClause,
          take: 10 - finalCount
        });
      }

      // Combine results in priority order
      allIssues = [
        ...exactIssueKeyMatches,
        ...partialIssueKeyMatches,
        ...titleMatches,
        ...descriptionMatches
      ];
    } else {
      // If no query, just get recent issues
      allIssues = await prisma.issue.findMany({
        where: whereClause,
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              issuePrefix: true,
            }
          },
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            }
          },
          assignee: {
            select: {
              id: true,
              name: true,
              image: true
            }
          }
        },
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' }
        ],
        take: 10
      });
    }

    // Transform issues to match the expected format
    const transformedIssues = allIssues.map(issue => ({
      id: issue.id,
      title: issue.title,
      issueKey: issue.issueKey,
      type: issue.type,
      status: issue.status,
      priority: issue.priority,
      project: issue.project,
      workspace: issue.workspace,
      assignee: issue.assignee,
    }));

    return NextResponse.json(transformedIssues, { status: 200 });
  } catch (error) {
    console.error('[ISSUES_SEARCH]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
