import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Get a single post
export async function GET(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const post = await prisma.post.findUnique({
      where: {
        id: params.postId,
      },
      include: {
        author: true,
        tags: true,
        comments: {
          include: {
            author: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        reactions: true,
      },
    });

    if (!post) {
      return new NextResponse("Post not found", { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error("[POST_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

// Update a post
export async function PATCH(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const _params = await params;
    const { postId } = _params;
    const body = await req.json();
    const { message, type, tags, priority } = body;

    // Validation
    if (!message || !message.trim()) {
      return new NextResponse("Message is required", { status: 400 });
    }

    //TODO: Get length from config or environment variable
    if (message.length > 160) { // Arbitrary limit 
      return new NextResponse("Message is too long", { status: 400 });
    }

    if (!["UPDATE", "BLOCKER", "IDEA", "QUESTION"].includes(type)) {
      return new NextResponse("Invalid post type", { status: 400 });
    }

    if (!["normal", "high", "critical"].includes(priority)) {
      return new NextResponse("Invalid priority", { status: 400 });
    }

    // Verify the post exists
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!existingPost) {
      return new NextResponse("Post not found", { status: 404 });
    }

    // Verify the user is the author of the post
    if (existingPost.authorId !== user.id) {
      return new NextResponse("Unauthorized to edit this post", { status: 403 });
    }

    // Process tags - disconnect all existing tags and connect new ones
    const tagsArray = Array.isArray(tags) ? tags : [];
    
    // First, disconnect all existing tags
    await prisma.post.update({
      where: { id: postId },
      data: {
        tags: {
          set: [] // Remove all tag connections
        }
      }
    });
    
    // Create or find tags and connect them
    const tagConnections = [];
    const workspaceId = existingPost.workspaceId;
    
    for (const tagName of tagsArray) {
      let tag;
      
      // Try to find an existing tag
      try {
        tag = await prisma.tag.findFirst({
          where: {
            name: tagName,
            workspaceId: workspaceId
          }
        });
        
        // If tag doesn't exist, create it
        if (!tag) {
          tag = await prisma.tag.create({
            data: {
              name: tagName,
              workspaceId: workspaceId
            }
          });
        }
        
        tagConnections.push({ id: tag.id });
      } catch (error) {
        console.error(`Error processing tag ${tagName}:`, error);
        // Continue with other tags even if one fails
      }
    }
    
    // Update the post with new data and connect tags
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        message,
        type,
        priority,
        tags: {
          connect: tagConnections
        }
      },
      include: {
        author: true,
        tags: true,
      },
    });

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error("[POST_PATCH]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

// Delete a post
export async function DELETE(
  req: Request,
  { params }: { params: { postId: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const _params = await params;
    const { postId } = _params;

    // Verify the post exists
    const existingPost = await prisma.post.findUnique({
      where: { id: postId },
    });

    if (!existingPost) {
      return new NextResponse("Post not found", { status: 404 });
    }

    // Verify the user is the author of the post
    if (existingPost.authorId !== user.id) {
      return new NextResponse("Unauthorized to delete this post", { status: 403 });
    }

    // Delete the post - Prisma cascade will handle related records
    await prisma.post.delete({
      where: { id: postId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[POST_DELETE]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
} 