import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { message, html, type, tags, priority, workspaceId } = body;

    // Validation
    if (!message || !message.trim()) {
      return new NextResponse("Message is required", { status: 400 });
    }

    if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION", "RESOLVED"].includes(type)) {
      return new NextResponse("Invalid post type", { status: 400 });
    }

    if (!["normal", "high", "critical"].includes(priority)) {
      return new NextResponse("Invalid priority", { status: 400 });
    }

    if (!workspaceId) {
      return new NextResponse("Workspace is required", { status: 400 });
    }

    // Verify user has access to the workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: user.id },
          { members: { some: { userId: user.id } } }
        ]
      }
    });

    if (!workspace) {
      return new NextResponse("Workspace not found or access denied", { status: 403 });
    }

    // Create post with tags
    const post = await prisma.post.create({
      data: {
        message,
        html: html || null, // Store HTML content if provided
        type,
        priority,
        author: {
          connect: { id: user.id }
        },
        workspace: {
          connect: { id: workspaceId }
        },
        tags: {
          connectOrCreate: tags.map((tag: string) => ({
            where: {
              name_workspaceId: {
                name: tag,
                workspaceId
              }
            },
            create: {
              name: tag,
              workspaceId
            }
          }))
        }
      },
      include: {
        author: true,
        tags: true,
        workspace: true
      }
    });

    return NextResponse.json(post);

  } catch (error) {
    console.error("Post creation error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const tag = searchParams.get("tag");
    const authorId = searchParams.get("authorId");
    const workspaceId = searchParams.get("workspaceId");
    const limit = Number(searchParams.get("limit") || "20");

    // Build the query
    const query: any = {};

    // Filter by type if provided
    if (type && ["UPDATE", "BLOCKER", "IDEA", "QUESTION", "RESOLVED"].includes(type)) {
      query.type = type as any; // Cast to handle enum typing
    }

    // Filter by author if provided
    if (authorId) {
      query.authorId = authorId;
    }

    // Filter by workspace
    if (workspaceId) {
      query.workspaceId = workspaceId;
    } else {
      // Get workspaces the user has access to
      const accessibleWorkspaces = await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: currentUser.id },
            { members: { some: { userId: currentUser.id } } }
          ]
        },
        select: { id: true }
      });

      if (accessibleWorkspaces.length === 0) {
        return NextResponse.json([]);
      }

      // Include workspaceId IN filter
      query.workspaceId = {
        in: accessibleWorkspaces.map(w => w.id)
      };
    }

    // Filter by tag if provided
    const tagFilter = tag
      ? {
        tags: {
          some: {
            name: tag,
          },
        },
      }
      : {};

    // Get the posts
    const posts = await prisma.post.findMany({
      where: {
        ...query,
        ...tagFilter,
      },
      orderBy: [
        { isPinned: "desc" }, // Pinned posts first
        { createdAt: "desc" }, // Then by creation date
      ],
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            role: true,
            team: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        tags: true,
        comments: {
          select: {
            id: true,
          },
        },
        reactions: {
          select: {
            id: true,
            type: true,
            authorId: true,
          },
        },
      },
      take: limit,
    });

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Get posts error:", error);
    return NextResponse.json(
      { message: "Something went wrong" },
      { status: 500 }
    );
  }
} 