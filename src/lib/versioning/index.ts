/**
 * Note Versioning Library
 *
 * Provides functionality for creating, comparing, and managing note versions.
 */

import { prisma } from '@/lib/prisma';
import { NoteVersionChangeType } from '@prisma/client';
import crypto from 'crypto';

export interface CreateVersionOptions {
  noteId: string;
  title: string;
  content: string;
  authorId: string;
  comment?: string;
  changeType?: NoteVersionChangeType;
}

export interface VersionDiffResult {
  additions: number;
  deletions: number;
  changes: DiffChange[];
}

export interface DiffChange {
  type: 'add' | 'remove' | 'unchanged';
  value: string;
  lineNumber?: number;
}

/**
 * Generate MD5 hash for content comparison
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Detect the type of change between two versions
 */
export function detectChangeType(
  oldTitle: string,
  newTitle: string,
  oldContent: string,
  newContent: string
): NoteVersionChangeType {
  const titleChanged = oldTitle !== newTitle;
  const contentChanged = oldContent !== newContent;

  if (titleChanged && !contentChanged) {
    return 'TITLE';
  }

  return 'EDIT';
}

/**
 * Check if content has changed significantly enough to warrant a new version
 */
export function hasSignificantChange(
  oldContent: string,
  newContent: string,
  oldTitle: string,
  newTitle: string
): boolean {
  // Always create version if title changed
  if (oldTitle !== newTitle) {
    return true;
  }

  // Check content hash to avoid duplicate versions
  const oldHash = generateContentHash(oldContent);
  const newHash = generateContentHash(newContent);

  return oldHash !== newHash;
}

/**
 * Create a new version of a note
 */
export async function createVersion(options: CreateVersionOptions): Promise<{
  id: string;
  version: number;
}> {
  const { noteId, title, content, authorId, comment, changeType = 'EDIT' } = options;

  // Get the current note to check versioning settings
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: {
      version: true,
      versioningEnabled: true,
      title: true,
      content: true,
    },
  });

  if (!note) {
    throw new Error('Note not found');
  }

  if (!note.versioningEnabled) {
    throw new Error('Versioning is not enabled for this note');
  }

  // Check for significant changes (skip if restoring)
  if (changeType !== 'RESTORE' && changeType !== 'MERGE' && changeType !== 'CREATED') {
    if (!hasSignificantChange(note.content, content, note.title, title)) {
      // No significant change, return current version
      return {
        id: '',
        version: note.version,
      };
    }
  }

  const nextVersion = note.version + 1;
  const contentHash = generateContentHash(content);
  const detectedChangeType = changeType === 'EDIT'
    ? detectChangeType(note.title, title, note.content, content)
    : changeType;

  // Create the version and update note in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create the version record
    const version = await tx.noteVersion.create({
      data: {
        noteId,
        version: nextVersion,
        title,
        content,
        authorId,
        comment,
        changeType: detectedChangeType,
        contentHash,
      },
    });

    // Update the note's version counter
    await tx.note.update({
      where: { id: noteId },
      data: {
        version: nextVersion,
        lastVersionAt: new Date(),
        lastVersionBy: authorId,
      },
    });

    return version;
  });

  return {
    id: result.id,
    version: result.version,
  };
}

/**
 * Create the initial version when a note is created
 */
export async function createInitialVersion(options: {
  noteId: string;
  title: string;
  content: string;
  authorId: string;
}): Promise<void> {
  const { noteId, title, content, authorId } = options;

  // Check if note exists and has versioning enabled
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { versioningEnabled: true },
  });

  if (!note || !note.versioningEnabled) {
    return;
  }

  const contentHash = generateContentHash(content);

  await prisma.noteVersion.create({
    data: {
      noteId,
      version: 1,
      title,
      content,
      authorId,
      changeType: 'CREATED',
      contentHash,
      comment: 'Initial version',
    },
  });

  await prisma.note.update({
    where: { id: noteId },
    data: {
      lastVersionAt: new Date(),
      lastVersionBy: authorId,
    },
  });
}

/**
 * Get version history for a note
 */
export async function getVersionHistory(
  noteId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
) {
  const { limit = 50, offset = 0 } = options || {};

  const versions = await prisma.noteVersion.findMany({
    where: { noteId },
    orderBy: { version: 'desc' },
    take: limit,
    skip: offset,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  const total = await prisma.noteVersion.count({
    where: { noteId },
  });

  return {
    versions,
    total,
    hasMore: offset + limit < total,
  };
}

/**
 * Get a specific version of a note
 */
export async function getVersion(noteId: string, version: number) {
  return prisma.noteVersion.findUnique({
    where: {
      noteId_version: {
        noteId,
        version,
      },
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });
}

/**
 * Restore a note to a specific version
 */
export async function restoreVersion(
  noteId: string,
  targetVersion: number,
  authorId: string,
  comment?: string
): Promise<{ id: string; version: number }> {
  // Get the target version
  const targetVersionRecord = await getVersion(noteId, targetVersion);

  if (!targetVersionRecord) {
    throw new Error(`Version ${targetVersion} not found`);
  }

  // Create a new version with the restored content
  return createVersion({
    noteId,
    title: targetVersionRecord.title,
    content: targetVersionRecord.content,
    authorId,
    changeType: 'RESTORE',
    comment: comment || `Restored from version ${targetVersion}`,
  });
}

/**
 * Simple line-based diff for comparing versions
 */
export function compareVersions(
  oldContent: string,
  newContent: string
): VersionDiffResult {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const changes: DiffChange[] = [];
  let additions = 0;
  let deletions = 0;

  // Simple line-by-line comparison using LCS (Longest Common Subsequence) approach
  const lcs = computeLCS(oldLines, newLines);

  let oldIndex = 0;
  let newIndex = 0;
  let lcsIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (lcsIndex < lcs.length && oldIndex < oldLines.length && oldLines[oldIndex] === lcs[lcsIndex]) {
      if (newIndex < newLines.length && newLines[newIndex] === lcs[lcsIndex]) {
        // Line is unchanged
        changes.push({
          type: 'unchanged',
          value: lcs[lcsIndex],
          lineNumber: newIndex + 1,
        });
        oldIndex++;
        newIndex++;
        lcsIndex++;
      } else if (newIndex < newLines.length) {
        // Line was added
        changes.push({
          type: 'add',
          value: newLines[newIndex],
          lineNumber: newIndex + 1,
        });
        additions++;
        newIndex++;
      }
    } else if (oldIndex < oldLines.length && (lcsIndex >= lcs.length || oldLines[oldIndex] !== lcs[lcsIndex])) {
      // Line was removed
      changes.push({
        type: 'remove',
        value: oldLines[oldIndex],
      });
      deletions++;
      oldIndex++;
    } else if (newIndex < newLines.length) {
      // Line was added
      changes.push({
        type: 'add',
        value: newLines[newIndex],
        lineNumber: newIndex + 1,
      });
      additions++;
      newIndex++;
    }
  }

  return { additions, deletions, changes };
}

/**
 * Compute Longest Common Subsequence for line-based diff
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // Create DP table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

export { NoteVersionChangeType };
