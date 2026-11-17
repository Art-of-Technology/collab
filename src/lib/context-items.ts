import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { noteAccessWhere } from '@/lib/secrets/access';
import { stripHtmlToPlainText } from '@/lib/html-sanitizer';
import { optionalId, resolveContextLevel } from '@/lib/context-folders';
import { listContextFiles } from '@/lib/context-files';

/**
 * What the Context page shows in one place: the Notes and the files that are in one folder, or, at the
 * top of a level, the Notes of that workspace or project that are in no folder at all.
 *
 * A folder is read by the members of its workspace, and a file follows its folder, so the file read is
 * the folders' own. A Note keeps the rules it has everywhere else, asked here as `noteAccessWhere`: a
 * Note that is restricted, expired or encrypted is no more readable in a folder than outside one.
 */

/** A level's top and a folder are answered up to this many Notes and this many files. */
export const MAX_CONTEXT_ITEMS = 500;

const NOTE_FIELDS = {
  id: true, title: true, type: true, updatedAt: true, isAiContext: true,
} satisfies Prisma.NoteSelect;

/** A Note's title is written in the editor, so it is given back as the text a reader sees. */
async function notes(userId: string, where: Prisma.NoteWhereInput) {
  const rows = await prisma.note.findMany({
    where: { AND: [noteAccessWhere(userId), where] },
    select: NOTE_FIELDS,
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    take: MAX_CONTEXT_ITEMS,
  });
  return rows.map(row => ({ ...row, title: stripHtmlToPlainText(row.title).slice(0, 300) }));
}

export async function listContextItems(userId: string, input: { workspaceId: unknown; projectId: unknown; folderId: unknown }) {
  const folderId = optionalId(input.folderId, 'A folder');
  if (folderId) {
    const { files } = await listContextFiles(userId, { folderId });
    return { folderId, notes: await notes(userId, { folderId }), files };
  }
  const level = await resolveContextLevel(userId, input.workspaceId, input.projectId);
  // A file always lives in a folder, so the top of a level holds Notes alone. A personal Note is not
  // kept in a folder and is not part of a workspace's Context either, so it is not listed here.
  return {
    folderId: null,
    notes: await notes(userId, {
      folderId: null,
      scope: { in: ['WORKSPACE', 'PROJECT', 'PUBLIC'] },
      ...(level.projectId ? { projectId: level.projectId } : { workspaceId: level.workspaceId, projectId: null }),
    }),
    files: [],
  };
}
