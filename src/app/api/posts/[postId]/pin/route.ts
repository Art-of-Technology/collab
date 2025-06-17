import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';

export async function PUT(
  request: NextRequest,
  { params }: { params: { postId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _params = await params;
    const { postId } = _params;
    const body = await request.json();
    const { isPinned } = body;

    // Get the post to check workspace
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        workspaceId: true,
        authorId: true,
        isPinned: true,
      }
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Check permissions
    let canPin = false;
    
    if (!post.workspaceId) {
      // If no workspace, only author can pin
      canPin = post.authorId === session.user.id;
    } else {
      // Check if user has permission to pin posts
      const hasPermission = await checkUserPermission(
        session.user.id,
        post.workspaceId,
        Permission.PIN_POST
      );

      // Also allow post author and workspace owner to pin
      const workspace = await prisma.workspace.findUnique({
        where: { id: post.workspaceId },
        select: { ownerId: true }
      });

      canPin = hasPermission.hasPermission || 
               post.authorId === session.user.id ||
               workspace?.ownerId === session.user.id;
    }

    if (!canPin) {
      return NextResponse.json(
        { error: 'You do not have permission to pin posts' },
        { status: 403 }
      );
    }

    // Update the post
    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: {
        isPinned,
        pinnedAt: isPinned ? new Date() : null,
        pinnedBy: isPinned ? session.user.id : null,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          }
        },
        workspace: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    // Create a post action for the pin/unpin
    await prisma.postAction.create({
      data: {
        postId,
        userId: session.user.id,
        actionType: isPinned ? 'PINNED' : 'UNPINNED',
        metadata: {},
      }
    });

    return NextResponse.json({
      success: true,
      post: updatedPost,
      message: isPinned ? 'Post pinned successfully' : 'Post unpinned successfully'
    });

  } catch (error) {
    console.error('Error pinning/unpinning post:', error);
    return NextResponse.json(
      { error: 'Failed to update post pin status' },
      { status: 500 }
    );
  }
} 