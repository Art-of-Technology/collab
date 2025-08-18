import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export interface SearchResult {
  id: string;
  type: 'user' | 'issue' | 'view' | 'post' | 'note' | 'project' | 'tag';
  title: string;
  description?: string;
  url: string;
  metadata?: Record<string, any>;
}

// GET /api/search - Universal search across all content types
export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const url = new URL(req.url);
    const query = url.searchParams.get("q");
    const workspaceId = url.searchParams.get("workspace");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    
    if (!query || query.length < 1) {
      return NextResponse.json([]);
    }
    
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
    }

    // Verify user has access to workspace
    const hasAccess = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: currentUser.id },
          { members: { some: { userId: currentUser.id } } }
        ]
      },
      select: { id: true, slug: true }
    });
    
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const results: SearchResult[] = [];
    const workspaceSlug = hasAccess.slug || workspaceId;

    // Search Users
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { team: { contains: query, mode: 'insensitive' } },
        ],
        AND: [
          { id: { not: currentUser.id } },
          {
            OR: [
              { ownedWorkspaces: { some: { id: workspaceId } } },
              { workspaceMemberships: { some: { workspaceId } } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        team: true,
        useCustomAvatar: true,
        avatarAccessory: true, 
        avatarBrows: true,
        avatarEyes: true,
        avatarEyewear: true,
        avatarHair: true,
        avatarMouth: true,
        avatarNose: true,
        avatarSkinTone: true,
      },
      take: Math.min(limit, 10),
    });

    users.forEach(user => {
      results.push({
        id: user.id,
        type: 'user',
        title: user.name || user.email || 'Unknown User',
        description: user.role ? `${user.role}${user.team ? ` • ${user.team}` : ''}` : user.team,
        url: `/${workspaceSlug}/profile/${user.id}`,
        metadata: { user }
      });
    });

    // Search Issues
    const issues = await prisma.issue.findMany({
      where: {
        workspaceId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { issueKey: { contains: query, mode: 'insensitive' } },
        ]
      },
      select: {
        id: true,
        title: true,
        description: true,
        issueKey: true,
        priority: true,
        statusValue: true,
        type: true,
        assignee: {
          select: { id: true, name: true, email: true }
        },
        project: {
          select: { id: true, name: true }
        }
      },
      take: Math.min(limit, 15),
      orderBy: { updatedAt: 'desc' }
    });

    issues.forEach(issue => {
      results.push({
        id: issue.id,
        type: 'issue',
        title: `${issue.issueKey}: ${issue.title}`,
        description: issue.description || '',
        url: `/${workspaceSlug}/issues/${issue.id}`,
        metadata: { issue }
      });
    });

    // Search Views
    const views = await prisma.view.findMany({
      where: {
        workspaceId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        displayType: true,
        visibility: true,
        _count: {
          select: { issuePositions: true }
        }
      },
      take: Math.min(limit, 10),
      orderBy: { updatedAt: 'desc' }
    });

    views.forEach(view => {
      results.push({
        id: view.id,
        type: 'view',
        title: view.name,
        description: `${view.displayType} view • ${view._count.issuePositions} items`,
        url: `/${workspaceSlug}/views/${view.slug || view.id}`,
        metadata: { view }
      });
    });

    // Search Projects
    const projects = await prisma.project.findMany({
      where: {
        workspaceId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        slug: true,
        color: true,
        _count: {
          select: { issues: true }
        }
      },
      take: Math.min(limit, 10),
      orderBy: { updatedAt: 'desc' }
    });

    projects.forEach(project => {
      results.push({
        id: project.id,
        type: 'project',
        title: project.name,
        description: `Project • ${project._count.issues} issues`,
        url: `/${workspaceSlug}/projects/${project.slug || project.id}`,
        metadata: { project }
      });
    });

    // Search Notes
    const notes = await prisma.note.findMany({
      where: {
        workspaceId,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        author: {
          select: { name: true }
        },
        tags: {
          select: { name: true }
        }
      },
      take: Math.min(limit, 10),
      orderBy: { updatedAt: 'desc' }
    });

    notes.forEach(note => {
      results.push({
        id: note.id,
        type: 'note',
        title: note.title,
        description: `Note by ${note.author.name}${note.tags.length ? ` • ${note.tags.map(t => t.name).join(', ')}` : ''}`,
        url: `/${workspaceSlug}/notes/${note.id}`,
        metadata: { note }
      });
    });

    // Search Posts
    const posts = await prisma.post.findMany({
      where: {
        workspaceId,
        OR: [
          { message: { contains: query, mode: 'insensitive' } },
        ]
      },
      select: {
        id: true,
        message: true,
        author: {
          select: { name: true }
        },
        _count: {
          select: { comments: true, reactions: true }
        }
      },
      take: Math.min(limit, 10),
      orderBy: { createdAt: 'desc' }
    });

    posts.forEach(post => {
      const truncatedMessage = post.message.length > 100 
        ? post.message.substring(0, 100) + '...' 
        : post.message;
      
      results.push({
        id: post.id,
        type: 'post',
        title: truncatedMessage,
        description: `Post by ${post.author.name} • ${post._count.comments} comments • ${post._count.reactions} reactions`,
        url: `/${workspaceSlug}/posts/${post.id}`,
        metadata: { post }
      });
    });

    // Search Tags
    const tags = await prisma.tag.findMany({
      where: {
        name: { contains: query, mode: 'insensitive' },
        posts: {
          some: { workspaceId }
        }
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            posts: {
              where: { workspaceId }
            }
          }
        }
      },
      take: Math.min(limit, 8),
      orderBy: { name: 'asc' }
    });

    tags.forEach(tag => {
      results.push({
        id: tag.id,
        type: 'tag',
        title: `#${tag.name}`,
        description: `Tag • ${tag._count.posts} posts`,
        url: `/${workspaceSlug}/timeline?tag=${encodeURIComponent(tag.name)}`,
        metadata: { tag }
      });
    });

    // Sort results by relevance (exact matches first, then by type priority)
    const typePriority = { issue: 1, project: 2, view: 3, user: 4, note: 5, post: 6, tag: 7 };
    
    results.sort((a, b) => {
      // Exact title matches first
      const aExact = a.title.toLowerCase() === query.toLowerCase() ? 0 : 1;
      const bExact = b.title.toLowerCase() === query.toLowerCase() ? 0 : 1;
      
      if (aExact !== bExact) return aExact - bExact;
      
      // Then by type priority
      return (typePriority[a.type] || 10) - (typePriority[b.type] || 10);
    });

    const finalResults = results.slice(0, limit);
    console.log(`Search API: query="${query}", results=${finalResults.length}`, finalResults.map(r => ({ type: r.type, title: r.title })));
    
    return NextResponse.json(finalResults);
  } catch (error) {
    console.error("Error searching content:", error);
    return NextResponse.json(
      { error: "Failed to search content" },
      { status: 500 }
    );
  }
}
