import 'server-only';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { userHasWorkspaceAccess } from '@/lib/issue-finder';

export async function requirePostAccess(postId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');
  if (typeof postId !== 'string' || !postId) throw new Error('Post not found');

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { workspaceId: true },
  });
  if (!post || !await userHasWorkspaceAccess(user.id, post.workspaceId)) {
    throw new Error('Post not found');
  }
}

export async function requireCommentAccess(commentId: string, postId?: string): Promise<void> {
  if (typeof commentId !== 'string' || !commentId || (postId !== undefined && !postId)) {
    throw new Error('Comment not found');
  }
  const comment = await prisma.comment.findUnique({
    where: { id: commentId, ...(postId !== undefined && { postId }) },
    select: { postId: true },
  });
  if (!comment?.postId) throw new Error('Comment not found');
  await requirePostAccess(comment.postId);
}
