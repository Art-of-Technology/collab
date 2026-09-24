import { prisma } from '@/lib/prisma';
import { commentAccessWhere } from '@/lib/post-access';

type CommentLink = { id: string; postId: string | null };

export async function deletePostComment(commentId: string, postId: string, userId: string) {
  await prisma.$transaction(async tx => {
    let pending = await tx.$queryRaw<CommentLink[]>`
      SELECT "id", "postId" FROM "Comment" WHERE "id" = ${commentId} FOR UPDATE
    `;
    if (pending.length !== 1) throw new Error('Comment not found');
    const visited = new Set<string>();
    while (pending.length) {
      if (pending.some(comment => comment.postId !== postId)) throw new Error('Invalid comment tree');
      const ids = pending.map(comment => comment.id).filter(id => !visited.has(id));
      if (!ids.length) break;
      ids.forEach(id => visited.add(id));
      pending = await tx.$queryRaw<CommentLink[]>`
        SELECT "id", "postId" FROM "Comment" WHERE "parentId" = ANY(${ids}::text[]) FOR UPDATE
      `;
    }
    await tx.comment.delete({
      where: { ...commentAccessWhere(commentId, userId, postId), id: commentId, authorId: userId },
    });
  }, { isolationLevel: 'ReadCommitted' });
}
