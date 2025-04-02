import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { postId } = params;

    // Fetch the post to check if it exists and belongs to the user's workspace
    const post = await prisma.post.findUnique({
      where: {
        id: postId,
      },
      select: {
        id: true,
        workspaceId: true,
      },
    });

    if (!post) {
      return new NextResponse("Post not found", { status: 404 });
    }
    
    // If post doesn't have a workspaceId, return error
    if (!post.workspaceId) {
      return new NextResponse("Post not associated with a workspace", { status: 400 });
    }

    // Get user's workspace memberships to check access
    const userWorkspaces = await prisma.workspaceMember.findMany({
      where: {
        userId: currentUser.id,
      },
      select: {
        workspaceId: true,
      },
    });

    const userWorkspaceIds = userWorkspaces.map((wm: { workspaceId: string }) => wm.workspaceId);

    // Check if user has access to the post's workspace
    if (!userWorkspaceIds.includes(post.workspaceId)) {
      return new NextResponse("Unauthorized", { status: 403 });
    }

    // Fetch tasks that are linked to this post
    const tasks = await prisma.task.findMany({
      where: {
        postId: postId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        type: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("[POST_TASKS_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
} 