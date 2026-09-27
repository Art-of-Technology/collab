import { postAccessWhere } from "@/lib/post-access";
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { checkUserPermission, Permission } from '@/lib/permissions';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const _params = await params;
    const { postId } = _params;
    const body = await request.json();
    const { isPinned } = body;

    // Get the post to check workspace
    const post = await prisma.post.findFirst({
      where: postAccessWhere(postId, actor.id),
      select: {
        id: true,
        workspaceId: true,
        authorId: true,
        isPinned: true,
      }
    });

    if (!post?.workspaceId) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const hasPermission = await checkUserPermission(actor.id, post.workspaceId, Permission.PIN_POST);
    const workspace = await prisma.workspace.findUnique({
      where: { id: post.workspaceId }, select: { ownerId: true }
    });
    const canPin = hasPermission.hasPermission || post.authorId === actor.id || workspace?.ownerId === actor.id;

    if (!canPin) {
      return NextResponse.json(
        { error: 'You do not have permission to pin posts' },
        { status: 403 }
      );
    }

    // Update the post
    const updatedPost = await prisma.post.update({
      where: {
        id: postId,
        AND: [
          postAccessWhere(postId, actor.id),
          { OR: [
            { authorId: actor.id },
            { workspace: { ownerId: actor.id } },
            { workspace: { members: { some: {
              userId: actor.id, status: true, user: { role: 'SYSTEM_ADMIN' },
            } } } },
            ...(hasPermission.hasPermission && hasPermission.userRole ? [{ workspace: {
              AND: [
                { members: { some: { userId: actor.id, status: true, role: hasPermission.userRole } } },
                { rolePermissions: { some: { role: hasPermission.userRole, permission: Permission.PIN_POST } } },
              ],
            } }] : []),
          ] },
        ],
      },
      data: {
        isPinned,
        pinnedAt: isPinned ? new Date() : null,
        pinnedBy: isPinned ? actor.id : null,
        actions: { create: {
          userId: actor.id,
          actionType: isPinned ? 'PINNED' : 'UNPINNED',
          metadata: {},
        } },
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

    return NextResponse.json({
      success: true,
      post: updatedPost,
      message: isPinned ? 'Post pinned successfully' : 'Post unpinned successfully'
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch {
    console.error('Error pinning/unpinning post');
    return NextResponse.json(
      { error: 'Failed to update post pin status' },
      { status: 500 }
    );
  }
}
