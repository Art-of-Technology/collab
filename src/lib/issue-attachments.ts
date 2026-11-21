import { prisma } from '@/lib/prisma';
import { ContextFolderError, createContextFolder } from '@/lib/context-folders';
import { fileName, uploadContextFile } from '@/lib/context-files';
import { contextPreviewKind } from '@/lib/context-file-preview';

/**
 * A file an agent attaches to an issue.
 *
 * It is a Context file like any other, kept in one folder of the issue's project, so it is read by
 * whoever reads that project's Context: the members of the workspace, who also read the issue. The
 * reply carries the Markdown that shows it, for the agent to put in a description or a comment.
 *
 * The bytes arrive as base64 inside a JSON body, because that is what the CLI and the app API speak.
 * The limit is stated here and is well under what a request body may carry.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ATTACHMENTS_FOLDER = 'Issue attachments';

function decoded(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !value) throw new ContextFolderError(400, 'A file is required: contentBase64 is empty');
  // Weighed before it is decoded: four characters carry three bytes.
  if (value.length > Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4) {
    throw new ContextFolderError(413, `An attachment is at most ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
  }
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new ContextFolderError(400, 'contentBase64 must be standard base64');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new ContextFolderError(400, 'contentBase64 must be standard base64');
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new ContextFolderError(413, `An attachment is at most ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
  if (!bytes.byteLength) throw new ContextFolderError(400, 'This file is empty');
  return bytes;
}

/** The project's one folder for attachments: the oldest live one of that name at the top, made on first use. */
async function attachmentsFolder(userId: string, issue: { workspaceId: string; projectId: string }): Promise<{ id: string }> {
  const existing = await prisma.contextFolder.findFirst({
    where: { workspaceId: issue.workspaceId, projectId: issue.projectId, parentId: null, name: ATTACHMENTS_FOLDER, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return existing ?? createContextFolder(userId, { workspaceId: issue.workspaceId, projectId: issue.projectId, name: ATTACHMENTS_FOLDER });
}

export async function attachToIssue(
  userId: string, issue: { workspaceId: string; projectId: string }, input: { name?: unknown; contentBase64?: unknown },
) {
  const bytes = decoded(input.contentBase64);
  const name = fileName(input.name);
  const folder = await attachmentsFolder(userId, issue);
  const file = await uploadContextFile(userId, { folderId: folder.id, name, bytes });
  // The name becomes link text, so nothing in it may close the link or start a line of its own.
  const label = file.name.replace(/[\[\]\\\r\n]/g, ' ').trim() || 'file';
  const markdown = contextPreviewKind(file) === 'image'
    ? `![${label}](/api/context/files/${file.id}/preview)`
    : `[${label}](/api/context/files/${file.id}/download)`;
  return { file, markdown };
}
