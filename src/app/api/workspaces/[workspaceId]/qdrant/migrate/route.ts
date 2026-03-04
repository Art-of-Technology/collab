/**
 * POST /api/workspaces/[workspaceId]/qdrant/migrate
 *
 * Bulk-indexes all issues, issue activities, and context (notes)
 * from PostgreSQL into Qdrant for semantic search.
 *
 * Requires the requesting user to be a workspace owner or admin.
 * Idempotent — safe to run multiple times (upserts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import {
  batchSyncIssuesToQdrant,
  batchSyncContextsToQdrant,
  batchSyncActivitiesToQdrant,
  getCollectionInfo,
  type MigrationStats,
} from '@/lib/qdrant-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max for large migrations

// Page size for reading from PostgreSQL
const DB_PAGE_SIZE = 500;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    // Support internal API key auth for CLI/migration scripts
    const internalKey = request.headers.get('x-internal-key');
    const isInternalAuth =
      internalKey && internalKey === process.env.NEXTAUTH_SECRET;

    if (!isInternalAuth) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { workspaceId: wsId } = await params;

      // Verify workspace access (owner or admin)
      const membership = await prisma.workspaceMember.findFirst({
        where: {
          userId: session.user.id,
          workspaceId: wsId,
          status: true,
        },
        select: { role: true },
      });

      const workspace = await prisma.workspace.findFirst({
        where: { id: wsId },
        select: { ownerId: true },
      });

      const isOwner = workspace?.ownerId === session.user.id;
      const isAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';

      if (!isOwner && !isAdmin) {
        return NextResponse.json(
          { error: 'Access denied — only workspace owners/admins can trigger migration' },
          { status: 403 }
        );
      }
    }

    const { workspaceId } = await params;

    // Check Qdrant is reachable
    const collectionInfo = await getCollectionInfo();
    if (!collectionInfo) {
      return NextResponse.json(
        { error: 'Qdrant is not reachable. Ensure QDRANT_URL is configured.' },
        { status: 503 }
      );
    }

    const startTime = Date.now();
    const stats: MigrationStats = {
      issues: { total: 0, synced: 0, errors: 0 },
      activities: { total: 0, synced: 0, errors: 0 },
      contexts: { total: 0, synced: 0, errors: 0 },
    };

    // -----------------------------------------------------------------------
    // 1. Migrate Issues
    // -----------------------------------------------------------------------
    console.log(`[qdrant-migrate] Starting issue migration for workspace ${workspaceId}...`);

    let issueOffset = 0;
    while (true) {
      const issues = await prisma.issue.findMany({
        where: { workspaceId },
        select: {
          id: true,
          title: true,
          description: true,
          issueKey: true,
          type: true,
          priority: true,
          status: true,
          statusId: true,
          projectId: true,
          workspaceId: true,
          assigneeId: true,
          reporterId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: issueOffset,
        take: DB_PAGE_SIZE,
      });

      if (issues.length === 0) break;

      stats.issues.total += issues.length;

      const result = await batchSyncIssuesToQdrant(
        issues.map((i) => ({
          ...i,
          issueKey: i.issueKey ?? undefined,
          type: i.type ?? undefined,
          status: i.status ?? undefined,
          statusId: i.statusId ?? undefined,
          assigneeId: i.assigneeId ?? undefined,
          reporterId: i.reporterId ?? undefined,
        }))
      );

      stats.issues.synced += result.synced;
      stats.issues.errors += result.errors;
      issueOffset += issues.length;

      console.log(
        `[qdrant-migrate] Issues: ${stats.issues.synced}/${stats.issues.total} synced (${stats.issues.errors} errors)`
      );

      if (issues.length < DB_PAGE_SIZE) break;
    }

    // -----------------------------------------------------------------------
    // 2. Migrate Issue Activities
    // -----------------------------------------------------------------------
    console.log(`[qdrant-migrate] Starting activity migration for workspace ${workspaceId}...`);

    let activityOffset = 0;
    while (true) {
      const activities = await prisma.issueActivity.findMany({
        where: { workspaceId },
        select: {
          id: true,
          action: true,
          itemId: true,
          fieldName: true,
          oldValue: true,
          newValue: true,
          details: true,
          workspaceId: true,
          projectId: true,
          userId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: activityOffset,
        take: DB_PAGE_SIZE,
      });

      if (activities.length === 0) break;

      stats.activities.total += activities.length;

      const result = await batchSyncActivitiesToQdrant(
        activities.map((a) => ({
          ...a,
          fieldName: a.fieldName ?? undefined,
          oldValue: a.oldValue ?? undefined,
          newValue: a.newValue ?? undefined,
          details: a.details ?? undefined,
          projectId: a.projectId ?? undefined,
        }))
      );

      stats.activities.synced += result.synced;
      stats.activities.errors += result.errors;
      activityOffset += activities.length;

      console.log(
        `[qdrant-migrate] Activities: ${stats.activities.synced}/${stats.activities.total} synced (${stats.activities.errors} errors)`
      );

      if (activities.length < DB_PAGE_SIZE) break;
    }

    // -----------------------------------------------------------------------
    // 3. Migrate Context (Notes)
    // -----------------------------------------------------------------------
    console.log(`[qdrant-migrate] Starting context migration for workspace ${workspaceId}...`);

    let contextOffset = 0;
    while (true) {
      const contexts = await prisma.note.findMany({
        where: {
          workspaceId,
          // Skip encrypted secret notes — their content is meaningless for embeddings
          isEncrypted: false,
        },
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          scope: true,
          isAiContext: true,
          aiContextPriority: true,
          projectId: true,
          workspaceId: true,
          authorId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
        skip: contextOffset,
        take: DB_PAGE_SIZE,
      });

      if (contexts.length === 0) break;

      stats.contexts.total += contexts.length;

      const result = await batchSyncContextsToQdrant(
        contexts.map((c) => ({
          ...c,
          type: c.type ?? undefined,
          scope: c.scope ?? undefined,
          projectId: c.projectId ?? undefined,
          workspaceId: c.workspaceId ?? undefined,
        }))
      );

      stats.contexts.synced += result.synced;
      stats.contexts.errors += result.errors;
      contextOffset += contexts.length;

      console.log(
        `[qdrant-migrate] Contexts: ${stats.contexts.synced}/${stats.contexts.total} synced (${stats.contexts.errors} errors)`
      );

      if (contexts.length < DB_PAGE_SIZE) break;
    }

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const totalSynced = stats.issues.synced + stats.activities.synced + stats.contexts.synced;
    const totalErrors = stats.issues.errors + stats.activities.errors + stats.contexts.errors;

    // Get updated collection info
    const finalInfo = await getCollectionInfo();

    console.log(
      `[qdrant-migrate] ✅ Migration complete in ${elapsed}s — ${totalSynced} points synced, ${totalErrors} errors`
    );

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}s`,
      stats,
      totals: {
        synced: totalSynced,
        errors: totalErrors,
        total: stats.issues.total + stats.activities.total + stats.contexts.total,
      },
      collection: finalInfo,
    });
  } catch (error) {
    console.error('[qdrant-migrate] Migration failed:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspaces/[workspaceId]/qdrant/migrate
 *
 * Returns current Qdrant collection status (point count, health).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    // Support internal API key auth for CLI/migration scripts
    const internalKey = request.headers.get('x-internal-key');
    const isInternalAuth =
      internalKey && internalKey === process.env.NEXTAUTH_SECRET;

    if (!isInternalAuth) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const { workspaceId: wsId } = await params;

      const hasAccess = await prisma.workspaceMember.findFirst({
        where: { userId: session.user.id, workspaceId: wsId, status: true },
      });
      const workspace = await prisma.workspace.findFirst({
        where: { id: wsId },
        select: { ownerId: true },
      });

      if (!hasAccess && workspace?.ownerId !== session.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    const { workspaceId } = await params;

    const collectionInfo = await getCollectionInfo();

    // Get PostgreSQL counts for comparison
    const [issueCount, activityCount, contextCount] = await Promise.all([
      prisma.issue.count({ where: { workspaceId } }),
      prisma.issueActivity.count({ where: { workspaceId } }),
      prisma.note.count({ where: { workspaceId, isEncrypted: false } }),
    ]);

    return NextResponse.json({
      collection: collectionInfo,
      postgresql: {
        issues: issueCount,
        activities: activityCount,
        contexts: contextCount,
        total: issueCount + activityCount + contextCount,
      },
    });
  } catch (error) {
    console.error('[qdrant-status] Failed to get status:', error);
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
