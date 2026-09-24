import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { commentAccessWhere, postAccessWhere } from '@/lib/post-access';

type CommentLink = { id: string; postId: string | null };

export async function deletePostComment(commentId: string, postId: string, userId: string) {
  await prisma.$transaction(async tx => {
    const pending = await tx.$queryRaw<CommentLink[]>`
      SELECT "id", "postId" FROM "Comment" WHERE "id" = ${commentId} FOR UPDATE
    `;
    if (pending.length !== 1) throw new Error('Comment not found');
    await assertCommentTree(tx, pending, postId);
    await tx.comment.delete({
      where: { ...commentAccessWhere(commentId, userId, postId), id: commentId, authorId: userId },
    });
  }, { isolationLevel: 'ReadCommitted' });
}

async function assertCommentTree(tx: Prisma.TransactionClient, pending: CommentLink[], postId: string) {
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
}

export async function deletePostWithComments(
  postId: string,
  userId: string,
  beforeDelete?: (tx: Prisma.TransactionClient) => Promise<void>
) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`;
    const post = await tx.post.findFirst({ where: postAccessWhere(postId, userId), select: { id: true } });
    if (!post) throw new Error('Post not found');
    const comments = await tx.$queryRaw<CommentLink[]>`
      SELECT "id", "postId" FROM "Comment" WHERE "postId" = ${postId} FOR UPDATE
    `;
    await assertCommentTree(tx, comments, postId);
    if (beforeDelete) await beforeDelete(tx);
    await tx.post.delete({ where: { ...postAccessWhere(postId, userId), id: postId } });
  }, { isolationLevel: 'ReadCommitted' });
}
