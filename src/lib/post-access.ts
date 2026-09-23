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
