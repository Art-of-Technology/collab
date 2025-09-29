import { Prisma } from '@prisma/client';

/**
 * This file extends Prisma types to include fields that might not be
 * properly recognized by the TypeScript compiler but exist in the schema.
 */

// Extend CommentWhereInput to include noteId
export interface CommentWhereInputExtension extends Prisma.CommentWhereInput {
  noteId?: string | Prisma.StringFilter;
}

// Extend NoteInclude to include comments
export interface NoteIncludeExtension extends Prisma.NoteInclude {
  comments?: boolean | Prisma.CommentFindManyArgs;
}
