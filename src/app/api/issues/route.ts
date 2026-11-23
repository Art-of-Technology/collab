import { Prisma } from '@prisma/client';
import { allocateIssueKey } from '@/lib/issue-key-allocation';
import { enqueueLabelHandoff, InvalidIssueLabels } from '@/lib/agent-label-triggers';
import { ForgeProjectWriteError, assertLegacyIssueWriteAllowed, assertLegacyProjectWriteAllowed } from '@/lib/forge/legacy-write-guard';
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/request-session";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { DEFAULT_STATUS_ORDER } from "@/constants/project-statuses";
import { trackCreation } from "@/lib/board-item-activity-service";
import { publishEvent } from '@/lib/redis';
import { extractMentionUserIds } from "@/utils/mentions";
import { NotificationService, NotificationType } from "@/lib/notification-service";
import { emitIssueCreated } from "@/lib/event-bus";
import { buildIssueRelations, RelationMap } from "@/utils/issueRelations";
import { assertAssignable, HandoffError } from "@/lib/issue-assignee";
import { issueAccessWhere, issueReadAccessWhere } from "@/lib/issue-finder";
import { withoutRequests } from "@/lib/issue-requests";

const RELATED_ISSUE_SELECT = {
  id: true,
  issueKey: true,
  title: true,
  type: true
} as const;

// Reuse a compact include set similar to the detail route
const LIST_INCLUDE = {
  project: { select: { id: true, name: true, slug: true, issuePrefix: true, description: true, color: true } },
  assignee: { select: { id: true, name: true, email: true, image: true } },
  reporter: { select: { id: true, name: true, email: true, image: true } },
  labels: { select: { id: true, name: true, color: true } },
  parent: { 
    select: { 
      id: true, 
      title: true, 
      issueKey: true, 
      type: true, 
      status: true,
      projectStatus: { 
        select: { 
          id: true, 
          name: true, 
          displayName: true, 
          color: true 
        } 
      }
    } 
  },
  children: { 
    select: { 
      id: true, 
      title: true, 
      issueKey: true, 
      type: true, 
      status: true,
      projectStatus: { 
        select: { 
          id: true, 
          name: true, 
          displayName: true, 
          color: true 
        } 
      }
    } 
  },
  projectStatus: { select: { id: true, name: true, displayName: true, color: true, order: true, isDefault: true } },
  _count: { select: { children: true, comments: true } },
  sourceRelations: {
    select: {
      id: true,
      relationType: true,
      targetIssue: { select: RELATED_ISSUE_SELECT }
    }
  },
  targetRelations: {
    select: {
      id: true,
      relationType: true,
      sourceIssue: { select: RELATED_ISSUE_SELECT }
    }
  }
} as const;

type IssueListRow = Prisma.IssueGetPayload<{ include: typeof LIST_INCLUDE }>;

function scopedIssueInclude(userId: string, readableIssue: Prisma.IssueWhereInput) {
  const relationAccess = { sourceIssue: readableIssue, targetIssue: readableIssue };
  return {
    ...LIST_INCLUDE,
    labels: { ...LIST_INCLUDE.labels, where: issueAccessWhere(userId) },
    parent: { ...LIST_INCLUDE.parent, where: readableIssue },
    children: { ...LIST_INCLUDE.children, where: readableIssue },
    _count: { select: { children: { where: readableIssue }, comments: true } },
    sourceRelations: { ...LIST_INCLUDE.sourceRelations, where: relationAccess },
    targetRelations: { ...LIST_INCLUDE.targetRelations, where: relationAccess },
  } as const satisfies Prisma.IssueInclude;
}

// Mirror issueReadAccessWhere and the active-issue extension in both reads.
function readableIssues(userId: string) {
  return Prisma.sql`
    readable_workspaces AS MATERIALIZED (
      SELECT id FROM "Workspace" w
      WHERE w."ownerId" = ${userId} OR EXISTS (
        SELECT 1 FROM "WorkspaceMember" m
        WHERE m."workspaceId" = w.id AND m."userId" = ${userId} AND m.status
      )
    ),
    readable_issues AS NOT MATERIALIZED (
      SELECT i.*
      FROM "Issue" i
      JOIN "Project" p ON p.id = i."projectId"
      LEFT JOIN "ProjectStatus" s ON s.id = i."statusId"
      LEFT JOIN "Project" sp ON sp.id = s."projectId"
      WHERE i."deletedAt" IS NULL
        AND i."workspaceId" IN (SELECT id FROM readable_workspaces)
        AND p."workspaceId" IN (SELECT id FROM readable_workspaces)
        AND (i."statusId" IS NULL OR sp."workspaceId" IN (SELECT id FROM readable_workspaces))
    )
  `;
}

function workspaceIssueKeys(userId: string, workspaceId: string, projectIds: string[], includeRequests: boolean) {
  const projects = projectIds.length
    ? Prisma.sql`AND "projectId" IN (${Prisma.join(projectIds)})`
    : Prisma.empty;
  return Prisma.sql`
    WITH ${readableIssues(userId)}
    SELECT id FROM readable_issues
    WHERE "workspaceId" = ${workspaceId}
      AND (${includeRequests} OR "agentRequestRole" IS NULL)
      ${projects}
    ORDER BY "updatedAt" DESC
  `;
}

// Keep the relation projections in sync with LIST_INCLUDE.
function workspaceIssueBatch(userId: string, ids: string[], includeRequests: boolean) {
  return Prisma.sql`
    WITH ${readableIssues(userId)}, listed AS MATERIALIZED (
      -- These IDs passed the visibility predicate in this transaction's snapshot.
      SELECT * FROM "Issue" WHERE id = ANY(${ids}::text[])
    ),
    hierarchy_ids AS (
      -- Resolve these keys together so skewed child counts don't inflate a per-issue plan.
      SELECT "parentId" AS id FROM listed WHERE "parentId" IS NOT NULL
      UNION
      SELECT id FROM "Issue" WHERE "parentId" = ANY (ARRAY(SELECT id FROM listed))
    ),
    hierarchy AS (
      SELECT i.id, i."parentId",
        json_build_object('id', i.id, 'issueKey', i."issueKey", 'title', i.title, 'type', i.type, 'status', i.status,
           'projectStatus', CASE WHEN s.id IS NOT NULL THEN json_build_object('id', s.id, 'name', s.name, 'displayName', s."displayName", 'color', s.color) END) AS row
      FROM readable_issues i
      LEFT JOIN "ProjectStatus" s ON s.id = i."statusId"
      WHERE (${includeRequests} OR i."agentRequestRole" IS NULL)
        AND i.id = ANY (ARRAY(SELECT id FROM hierarchy_ids))
    ),
    children AS (
      SELECT "parentId", json_agg(row) AS rows, count(*)::int AS total
      FROM hierarchy GROUP BY "parentId"
    )
    SELECT i.id, i.title, i.description, i.type, i."statusId", i."statusValue", i.priority, i."storyPoints",
      i."parentId", i."milestoneId", i."assigneeId", i."reporterId", i."projectId", i."workspaceId",
      i."dueDate", i."startDate", i."createdAt", i."updatedAt", i."deletedAt", i."deletedById",
      i."baselineStartDate", i."baselineDueDate", i."finishedAt", i."firstStartedAt", i."lastProgressAt",
      i."daysInProgress", i."issueKey", i.position, i.progress, i.color, i."postId", i.status,
      i."timeEstimateMinutes", i."timeSpentMinutes", i."agentRequestRole",
      json_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'issuePrefix', p."issuePrefix", 'description', p.description, 'color', p.color) AS project,
      CASE WHEN a.id IS NOT NULL THEN json_build_object('id', a.id, 'name', a.name, 'email', a.email, 'image', a.image) END AS assignee,
      CASE WHEN r.id IS NOT NULL THEN json_build_object('id', r.id, 'name', r.name, 'email', r.email, 'image', r.image) END AS reporter,
      COALESCE(l.rows, '[]') AS labels,
      parent.row AS parent,
      COALESCE(c.rows, '[]') AS children,
      CASE WHEN s.id IS NOT NULL THEN json_build_object('id', s.id, 'name', s.name, 'displayName', s."displayName", 'color', s.color, 'order', s."order", 'isDefault', s."isDefault") END AS "projectStatus",
      json_build_object('children', COALESCE(c.total, 0), 'comments', cm.total) AS _count,
      COALESCE(sr.rows, '[]') AS "sourceRelations",
      COALESCE(tr.rows, '[]') AS "targetRelations"
    FROM listed i
    JOIN "Project" p ON p.id = i."projectId"
    LEFT JOIN "User" a ON a.id = i."assigneeId"
    LEFT JOIN "User" r ON r.id = i."reporterId"
    LEFT JOIN "ProjectStatus" s ON s.id = i."statusId"
    LEFT JOIN hierarchy parent ON parent.id = i."parentId"
    LEFT JOIN children c ON c."parentId" = i.id
    -- The correlation keeps these aggregates on the indexed issue IDs even
    -- when most related rows in the database belong to other workspaces.
    CROSS JOIN LATERAL (
      SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS rows
      FROM "_IssueToLabel" l JOIN "TaskLabel" t ON t.id = l."B"
      WHERE l."A" = i.id AND t."workspaceId" IN (SELECT id FROM readable_workspaces)
    ) l
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS total FROM "IssueComment" WHERE "issueId" = i.id
    ) cm
    CROSS JOIN LATERAL (
      SELECT json_agg(json_build_object('id', r.id, 'relationType', r."relationType",
        'targetIssue', json_build_object('id', related.id, 'issueKey', related."issueKey", 'title', related.title, 'type', related.type))) AS rows
      FROM issue_relations r JOIN readable_issues related ON related.id = r."targetIssueId"
      WHERE r."sourceIssueId" = i.id
    ) sr
    CROSS JOIN LATERAL (
      SELECT json_agg(json_build_object('id', r.id, 'relationType', r."relationType",
        'sourceIssue', json_build_object('id', related.id, 'issueKey', related."issueKey", 'title', related.title, 'type', related.type))) AS rows
      FROM issue_relations r JOIN readable_issues related ON related.id = r."sourceIssueId"
      WHERE r."targetIssueId" = i.id
    ) tr
  `;
}

function presentIssue(issue: IssueListRow) {
  const { sourceRelations, targetRelations, ...fields } = issue;
  const issueRelations: RelationMap = buildIssueRelations(issue);
  return Object.assign(fields, { issueRelations });
}

async function workspaceIssueResponse(userId: string, keysQuery: Prisma.Sql, includeRequests: boolean) {
  const batchSize = 512;
  const encoder = new TextEncoder();
  const ready = Promise.withResolvers<void>();
  let cancelled = false;
  let started = false;
  let prefix = '{"issues":[';
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // The key list and body rows share a snapshot. Drain each batch into
      // encoded chunks without waiting for the browser to read them.
      void prisma.$transaction(async tx => {
        const keys = await tx.$queryRaw<{ id: string }[]>(keysQuery);
        for (let offset = 0; offset < keys.length && !cancelled; offset += batchSize) {
          const ids = keys.slice(offset, offset + batchSize).map(key => key.id);
          const rows = await tx.$queryRaw<IssueListRow[]>(workspaceIssueBatch(userId, ids, includeRequests));
          if (cancelled) return;
          rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          for (let index = 0; index < rows.length; index += 64) {
            const batch = rows.slice(index, index + 64).map(presentIssue);
            controller.enqueue(encoder.encode(prefix + JSON.stringify(batch).slice(1, -1)));
            prefix = ',';
            if (!started) {
              started = true;
              ready.resolve();
            }
          }
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 }).then(() => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(started ? ']}' : '{"issues":[]}'));
        controller.close();
        ready.resolve();
      }).catch(error => {
        if (cancelled) return;
        controller.error(error);
        if (started) console.error('[ISSUES_GET]', error);
        else ready.reject(error);
      });
    },
    cancel() {
      cancelled = true;
    },
  });
  await ready.promise;
  return new Response(body, { headers: { 'content-type': 'application/json' } });
}

// GET /api/issues - Get issues by workspace/project
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');
    const milestoneId = searchParams.get('milestoneId');
    const projectIds = searchParams.get('projectIds')?.split(',').filter(Boolean) ?? [];

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Verify access to workspace
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        OR: [
          { ownerId: session.user.id },
          { members: { some: { userId: session.user.id, status: true } } },
        ],
      },
    });
    
    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const includeRequests = searchParams.get('requests') === '1';
    if (!milestoneId && projectIds.length !== 1) {
      const keys = workspaceIssueKeys(session.user.id, workspaceId, projectIds, includeRequests);
      return await workspaceIssueResponse(session.user.id, keys, includeRequests);
    }

    const readableIssue = issueReadAccessWhere(session.user.id);
    const where = {
      ...readableIssue,
      workspaceId,
      ...(milestoneId && { milestoneId }),
      ...(projectIds.length > 0 && { projectId: { in: projectIds } }),
    };
    const include = scopedIssueInclude(session.user.id, readableIssue);
    const query = includeRequests ? { where, include } : withoutRequests(where, include);
    const issues = await prisma.issue.findMany({
      ...query,
      include: query.include as typeof include,
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({ issues: issues.map(presentIssue) }, { status: 200 });
  } catch (error) {
    console.error('[ISSUES_GET]', error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/issues - Create a new issue (unified model)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      type = 'TASK',
      status,
      priority = 'MEDIUM',
      projectId,
      workspaceId,
      assigneeId,
      reporterId,
      labels = [],
      dueDate,
      parentId,
    } = body;

    if (!title || !workspaceId || !projectId) {
      return NextResponse.json(
        { error: "Title, workspaceId and projectId are required" },
        { status: 400 }
      );
    }

    if (reporterId !== undefined && reporterId !== session.user.id) {
      return NextResponse.json({ error: "Reporter must be the current user" }, { status: 403 });
    }

    // Verify access to workspace and project
    // Support both workspace ID and slug
    const workspace = await prisma.workspace.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: workspaceId },
              { slug: workspaceId }
            ]
          },
          {
            OR: [
              { ownerId: session.user.id },
              { members: { some: { userId: session.user.id, status: true } } },
            ]
          }
        ]
      },
    });
    if (!workspace) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, workspaceId: workspace.id },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // null is what the assignee selector sends for "Unassigned"
    if (assigneeId != null && typeof assigneeId !== 'string') return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
    if (assigneeId) {
      await assertAssignable(prisma, { workspaceId: workspace.id, projectId: project.id, agentRequestRole: null }, assigneeId);
    }

    // A parent must be an issue of this workspace: checked before anything else looks at it.
    if (parentId && (typeof parentId !== 'string' || !await prisma.issue.findFirst({
      where: { id: parentId, workspaceId: workspace.id }, select: { id: true },
    }))) {
      return NextResponse.json({ error: "Invalid parent issue" }, { status: 400 });
    }

    // Use a transaction to ensure atomic counter increment and issue creation
    await assertLegacyProjectWriteAllowed(project.id);
    if (parentId) await assertLegacyIssueWriteAllowed(parentId);

    const created = await prisma.$transaction(async (tx) => {
      const issueKey = await allocateIssueKey(tx, projectId);

      // Find the ProjectStatus for the given status and project
      let statusId = null;
      if (status) {
        const projectStatus = await tx.projectStatus.findFirst({
          where: {
            projectId,
            OR: [
              { name: status },
              { displayName: status }
            ]
          }
        });
        statusId = projectStatus?.id || null;
      }

      // If no status provided or not found, get the default status for the project
      if (!statusId) {
        const defaultStatus = await tx.projectStatus.findFirst({
          where: {
            projectId,
            isDefault: true
          },
          orderBy: DEFAULT_STATUS_ORDER
        });
        statusId = defaultStatus?.id || null;
      }

      // Create the issue
      const newIssue = await tx.issue.create({
        data: {
          title,
          description,
          type: type,
          statusId: statusId,
          statusValue: status || undefined,
          status: status || undefined,
          priority,
          projectId,
          workspaceId: workspace.id,
          assigneeId: assigneeId || null,
          reporterId: session.user.id,
          issueKey,
          dueDate: dueDate ? new Date(dueDate) : null,
          parentId: parentId || null,
          labels: labels.length
            ? { connect: labels.map((id: string) => ({ id })) }
            : undefined,
        },
        include: {
          labels: true,
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          },
          projectStatus: {
            select: {
              id: true,
              name: true,
              displayName: true,
              color: true,
              order: true,
              isDefault: true
            }
          },
        },
      });

      if (labels.length) await enqueueLabelHandoff(tx, session.user.id, newIssue, []);

      // Create IssueAssignee record if issue is assigned to someone
      if (assigneeId) {
        await tx.issueAssignee.create({
          data: {
            issueId: newIssue.id,
            userId: assigneeId,
            role: "ASSIGNEE",
            status: "APPROVED", // Assignees are automatically approved
            assignedAt: new Date(),
            approvedAt: new Date(),
            approvedBy: session.user.id // The creator approves the assignment
          }
        });
      }

      // If this is a sub-issue (has a parent), create the PARENT relation
      if (parentId) {
        await tx.issueRelation.create({
          data: {
            sourceIssueId: newIssue.id,
            targetIssueId: parentId,
            relationType: 'PARENT',
          },
        });
      }

      return newIssue;
    });

    // Track creation as activity
    await trackCreation('ISSUE', created.id, session.user.id, workspace.id, undefined, created);

    // Publish realtime creation event
    await publishEvent(`workspace:${workspace.id}:events`, {
      type: 'issue.created',
      workspaceId: workspace.id,
      projectId: created.projectId,
      issueId: created.id,
      issueKey: created.issueKey,
      status: created.status ?? undefined,
      statusId: created.statusId ?? undefined,
      statusValue: created.statusValue ?? undefined,
    });

    // Minimal notifications for followers, assignee and reporter, and board/project followers
    try {
      const recipientIds = new Set<string>();

      // Issue followers
      const followers = await prisma.issueFollower.findMany({
        where: { issueId: created.id },
        select: { userId: true }
      });
      followers.forEach(f => recipientIds.add(f.userId));

      // Assignee and reporter
      if (created.assigneeId && created.assigneeId !== session.user.id) recipientIds.add(created.assigneeId);
      if (created.reporterId && created.reporterId !== session.user.id) recipientIds.add(created.reporterId);

      // Project followers
      const projectFollowerList = await prisma.projectFollower.findMany({
        where: { projectId: created.projectId },
        select: { userId: true }
      });
      projectFollowerList.forEach((pf: { userId: string }) => recipientIds.add(pf.userId));

      const recipients = Array.from(recipientIds).filter(id => id !== session.user.id);
      if (recipients.length > 0) {
        const pfSet = new Set(projectFollowerList.map(pf => pf.userId));
        const projectType = NotificationType.PROJECT_ISSUE_CREATED;
        const issueType = NotificationType.ISSUE_CREATED;
        const content = `@[${session.user.name}](${session.user.id}) created an issue #[${created.issueKey}](${created.id})`;

        // Send project-level notifications to project followers
        const projectFollowerRecipients = recipients.filter((id) => pfSet.has(id));
        if (projectFollowerRecipients.length > 0) {
          await NotificationService.notifyUsers(
            projectFollowerRecipients,
            projectType,
            content,
            session.user.id,
            { issueId: created.id }
          );
        }

        // Send standard issue notifications to the rest
        const standardRecipients = recipients.filter((id) => !pfSet.has(id));
        if (standardRecipients.length > 0) {
          await NotificationService.notifyUsers(
            standardRecipients,
            issueType,
            content,
            session.user.id,
            { issueId: created.id }
          );
        }
      }
    } catch (notificationError) {
      console.warn('[ISSUES_POST_NOTIFY]', notificationError);
    }

    // Mentions in description (notify tagged users)
    try {
      if (description && typeof description === 'string') {
        const mentionedUserIds = extractMentionUserIds(description);
        const recipients = mentionedUserIds.filter((id) => id !== session.user.id);
        if (recipients.length > 0) {
          await NotificationService.notifyUsers(
            recipients,
            NotificationType.ISSUE_MENTION,
            `@[${session.user.name}](${session.user.id}) mentioned you in an issue #[${created.issueKey}](${created.id})`,
            session.user.id,
            { issueId: created.id }
          );
        }
      }
    } catch (e) {
      console.warn('[ISSUES_POST_MENTIONS]', e);
    }

    // Emit webhook event for issue creation
    try {
      await emitIssueCreated(
        created,
        {
          userId: session.user.id,
          workspaceId: created.workspaceId,
          workspaceName: created.workspace?.name || '',
          workspaceSlug: created.workspace?.slug || '',
          source: 'api'
        },
        { async: true } // Don't block the response
      );
    } catch (e) {
      console.warn('[ISSUES_POST_WEBHOOK]', e);
    }

    return NextResponse.json({ issue: created }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidIssueLabels) return NextResponse.json({ error: 'invalid_labels' }, { status: 400 });
    if (error instanceof ForgeProjectWriteError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof HandoffError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[ISSUES_POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
