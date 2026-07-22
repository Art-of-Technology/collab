/**
 * Version Retention Policy
 *
 * Manages automatic cleanup of old versions based on configurable policies.
 */

import { prisma } from '@/lib/prisma';

export interface RetentionPolicy {
  maxVersions?: number; // Maximum number of versions to keep per note
  maxAgeDays?: number; // Maximum age in days for versions
  keepMilestones?: boolean; // Keep versions that are milestones (every 10th version)
  keepFirstVersion?: boolean; // Always keep the initial version
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  maxVersions: 100,
  maxAgeDays: 365,
  keepMilestones: true,
  keepFirstVersion: true,
};

/**
 * Apply retention policy to a specific note's versions
 */
export async function applyRetentionPolicy(
  noteId: string,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY
): Promise<{ deleted: number }> {
  const {
    maxVersions = 100,
    maxAgeDays = 365,
    keepMilestones = true,
    keepFirstVersion = true,
  } = policy;

  // Get all versions for this note
  const versions = await prisma.noteVersion.findMany({
    where: { noteId },
    orderBy: { version: 'desc' },
    select: {
      id: true,
      version: true,
      createdAt: true,
      changeType: true,
    },
  });

  if (versions.length === 0) {
    return { deleted: 0 };
  }

  const now = new Date();
  const maxAgeDate = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000);

  const idsToDelete: string[] = [];

  versions.forEach((version, index) => {
    // Always keep the most recent version
    if (index === 0) {
      return;
    }

    // Keep first version if configured
    if (keepFirstVersion && version.version === 1) {
      return;
    }

    // Keep milestones (every 10th version)
    if (keepMilestones && version.version % 10 === 0) {
      return;
    }

    // Keep CREATED versions as they mark significant events
    if (version.changeType === 'CREATED') {
      return;
    }

    // Delete if exceeds max versions (index is 0-based, so we use >= instead of >)
    if (maxVersions && index >= maxVersions) {
      idsToDelete.push(version.id);
      return;
    }

    // Delete if older than max age
    if (version.createdAt < maxAgeDate) {
      idsToDelete.push(version.id);
      return;
    }
  });

  if (idsToDelete.length === 0) {
    return { deleted: 0 };
  }

  // Delete the versions
  await prisma.noteVersion.deleteMany({
    where: {
      id: { in: idsToDelete },
    },
  });

  return { deleted: idsToDelete.length };
}

/**
 * Apply retention policy to all notes in a workspace
 */
export async function applyWorkspaceRetentionPolicy(
  workspaceId: string,
  policy: RetentionPolicy = DEFAULT_RETENTION_POLICY
): Promise<{ notesProcessed: number; versionsDeleted: number }> {
  const notes = await prisma.note.findMany({
    where: {
      workspaceId,
      versioningEnabled: true,
    },
    select: { id: true },
  });

  let versionsDeleted = 0;

  for (const note of notes) {
    const result = await applyRetentionPolicy(note.id, policy);
    versionsDeleted += result.deleted;
  }

  return {
    notesProcessed: notes.length,
    versionsDeleted,
  };
}

/**
 * Get version statistics for a note
 */
export async function getVersionStats(noteId: string) {
  const stats = await prisma.noteVersion.aggregate({
    where: { noteId },
    _count: true,
    _min: { createdAt: true },
    _max: { createdAt: true, version: true },
  });

  const changeTypeCounts = await prisma.noteVersion.groupBy({
    by: ['changeType'],
    where: { noteId },
    _count: true,
  });

  return {
    totalVersions: stats._count,
    oldestVersion: stats._min.createdAt,
    latestVersion: stats._max.createdAt,
    currentVersion: stats._max.version,
    byChangeType: changeTypeCounts.reduce(
      (acc, curr) => ({
        ...acc,
        [curr.changeType]: curr._count,
      }),
      {} as Record<string, number>
    ),
  };
}

/**
 * Estimate storage used by versions for a note
 */
export async function estimateVersionStorage(noteId: string): Promise<{
  totalBytes: number;
  averageBytesPerVersion: number;
  versionCount: number;
}> {
  const versions = await prisma.noteVersion.findMany({
    where: { noteId },
    select: {
      title: true,
      content: true,
      comment: true,
    },
  });

  let totalBytes = 0;

  for (const version of versions) {
    totalBytes += Buffer.byteLength(version.title, 'utf8');
    totalBytes += Buffer.byteLength(version.content, 'utf8');
    if (version.comment) {
      totalBytes += Buffer.byteLength(version.comment, 'utf8');
    }
  }

  return {
    totalBytes,
    averageBytesPerVersion: versions.length > 0 ? Math.round(totalBytes / versions.length) : 0,
    versionCount: versions.length,
  };
}
