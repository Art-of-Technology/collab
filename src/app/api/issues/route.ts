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
import { tellIssueEvent } from "@/lib/notification-issue-events";
import { buildIssueRelations, RelationMap } from "@/utils/issueRelations";
import { assertAssignable, HandoffError } from "@/lib/issue-assignee";
import { issueAccessWhere, issueReadAccessWhere } from "@/lib/issue-finder";
import { withoutRequests } from "@/lib/issue-requests";
import {
  ISSUE_LIST_DATE_FIELDS, ISSUE_LIST_EDGE_FIELDS, ISSUE_LIST_FIELDS, ISSUE_LIST_HIERARCHY_FIELDS, ISSUE_LIST_RELATED_FIELDS,
  previousIssueListSnapshot, type IssueListSnapshot,
} from "@/lib/issue-list-snapshot";

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

// Mirror issueReadAccessWhere and the active-issue extension in the workspace list.
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

type SnapshotKind = Exclude<keyof IssueListSnapshot, 'workspaceId' | 'fields'>;

// Each listed issue as an array of its values, in the order of ISSUE_LIST_FIELDS.
const ISSUE_LIST_VALUES = Prisma.join(ISSUE_LIST_FIELDS.map(key => {
  if ((ISSUE_LIST_DATE_FIELDS as readonly string[]).includes(key)) return Prisma.raw(`(date_part('epoch', i."${key}") * 1000)::bigint`);
  if (key === 'labels') return Prisma.raw(`COALESCE(l.rows, '[]')`);
  if (key === '_count') return Prisma.raw(`json_build_object('comments', COALESCE(cm.total, 0))`);
  return Prisma.raw(`i."${key}"`);
}));

// Each parent and child as an array of its values, in the order of ISSUE_LIST_HIERARCHY_FIELDS.
const HIERARCHY_VALUES = Prisma.join(ISSUE_LIST_HIERARCHY_FIELDS.map(key => key === 'projectStatus'
  ? Prisma.raw(`CASE WHEN s.id IS NOT NULL THEN json_build_object('id', s.id, 'name', s.name, 'displayName', s."displayName", 'color', s.color) END`)
  : Prisma.raw(`i."${key}"`)));

function listedIssues(workspaceId: string, projectIds: string[], includeRequests: boolean) {
  const projects = projectIds.length
    ? Prisma.sql`AND "projectId" IN (${Prisma.join(projectIds)})`
    : Prisma.empty;
  return Prisma.sql`
    WHERE "workspaceId" = ${workspaceId}
      AND (${includeRequests} OR "agentRequestRole" IS NULL)
      ${projects}
  `;
}

// The descriptions of the issues a broad list returns, by issue id, null included.
function issueDescriptionQuery(userId: string, workspaceId: string, projectIds: string[], includeRequests: boolean) {
  return Prisma.sql`
    WITH ${readableIssues(userId)}
    SELECT COALESCE(json_object_agg(id, description)::text, '{}') AS data
    FROM readable_issues
    ${listedIssues(workspaceId, projectIds, includeRequests)}
  `;
}

function workspaceIssueQuery(userId: string, workspaceId: string, projectIds: string[], includeRequests: boolean) {
  // One statement supplies a consistent snapshot. Project only the listed issue
  // fields, as arrays of values, and send shared records and field names once;
  // readIssueList expands them in the browser.
  // Descriptions are left out; the view reads them with issueDescriptionQuery.
  // Keep these projections in sync with LIST_INCLUDE.
  // The timestamp columns are UTC, stored as timestamp(3) without time zone.
  return Prisma.sql`
    WITH ${readableIssues(userId)}, listed AS MATERIALIZED (
      SELECT id, "projectId", "statusId", "parentId", "assigneeId", "reporterId"
      FROM readable_issues
      ${listedIssues(workspaceId, projectIds, includeRequests)}
    ),
    list_ids AS MATERIALIZED (SELECT id FROM listed),
    -- Parents and children that are not listed themselves; the browser reads listed ones from their rows.
    hierarchy_ids AS (
      SELECT "parentId" AS id FROM listed WHERE "parentId" IS NOT NULL
      UNION
      SELECT id FROM "Issue" WHERE "parentId" = ANY (ARRAY(SELECT id FROM list_ids))
      EXCEPT
      SELECT id FROM list_ids
    ),
    edge_ids AS (
      SELECT id FROM issue_relations WHERE "sourceIssueId" = ANY (ARRAY(SELECT id FROM list_ids))
      UNION
      SELECT id FROM issue_relations WHERE "targetIssueId" = ANY (ARRAY(SELECT id FROM list_ids))
    ),
    edges AS MATERIALIZED (
      SELECT id, "relationType", "sourceIssueId", "targetIssueId"
      FROM issue_relations WHERE id = ANY (ARRAY(SELECT id FROM edge_ids))
    ),
    -- Related issues that are not listed themselves, and only those the user can read.
    edge_issue_ids AS (
      SELECT "sourceIssueId" AS id FROM edges
      UNION
      SELECT "targetIssueId" AS id FROM edges
      EXCEPT
      SELECT id FROM list_ids
    ),
    edge_issues AS MATERIALIZED (
      SELECT id, "issueKey", title, type FROM readable_issues
      WHERE id = ANY (ARRAY(SELECT id FROM edge_issue_ids))
    ),
    readable_ends AS MATERIALIZED (
      SELECT id FROM list_ids
      UNION ALL
      SELECT id FROM edge_issues
    ),
    issue_labels AS (
      SELECT l."A" AS id, json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color)) AS rows
      FROM "_IssueToLabel" l JOIN "TaskLabel" t ON t.id = l."B"
      WHERE l."A" = ANY (ARRAY(SELECT id FROM list_ids)) AND t."workspaceId" IN (SELECT id FROM readable_workspaces)
      GROUP BY l."A"
    ),
    comment_counts AS (
      SELECT "issueId" AS id, count(*)::int AS total FROM "IssueComment"
      WHERE "issueId" = ANY (ARRAY(SELECT id FROM list_ids))
      GROUP BY "issueId"
    )
    SELECT 'issues' AS kind, date_part('epoch', i."updatedAt") AS sort, json_build_array(${ISSUE_LIST_VALUES})::text AS data
    FROM "Issue" i
    LEFT JOIN issue_labels l ON l.id = i.id
    LEFT JOIN comment_counts cm ON cm.id = i.id
    WHERE i.id = ANY (ARRAY(SELECT id FROM list_ids))
    UNION ALL
    SELECT 'projects' AS kind, NULL::float8 AS sort, row_to_json(fields)::text AS data FROM (
      SELECT id, name, slug, "issuePrefix", description, color FROM "Project"
      WHERE id = ANY (ARRAY(SELECT DISTINCT "projectId" FROM listed))
    ) fields
    UNION ALL
    SELECT 'people' AS kind, NULL::float8 AS sort, row_to_json(fields)::text AS data FROM (
      SELECT id, name, email, image FROM "User"
      WHERE id = ANY (ARRAY(
        SELECT "assigneeId" FROM listed WHERE "assigneeId" IS NOT NULL
        UNION
        SELECT "reporterId" FROM listed WHERE "reporterId" IS NOT NULL
      ))
    ) fields
    UNION ALL
    SELECT 'statuses' AS kind, NULL::float8 AS sort, row_to_json(fields)::text AS data FROM (
      SELECT id, name, "displayName", color, "order", "isDefault" FROM "ProjectStatus"
      WHERE id = ANY (ARRAY(SELECT DISTINCT "statusId" FROM listed WHERE "statusId" IS NOT NULL))
    ) fields
    UNION ALL
    SELECT 'hierarchy' AS kind, NULL::float8 AS sort, json_build_array(${HIERARCHY_VALUES})::text AS data
    FROM readable_issues i
    LEFT JOIN "ProjectStatus" s ON s.id = i."statusId"
    WHERE (${includeRequests} OR i."agentRequestRole" IS NULL)
      AND i.id = ANY (ARRAY(SELECT id FROM hierarchy_ids))
    UNION ALL
    SELECT 'edges' AS kind, NULL::float8 AS sort, json_build_array(${Prisma.join(ISSUE_LIST_EDGE_FIELDS.map(key => Prisma.raw(`e."${key}"`)))})::text AS data
    FROM edges e
    WHERE e."sourceIssueId" IN (SELECT id FROM readable_ends) AND e."targetIssueId" IN (SELECT id FROM readable_ends)
    UNION ALL
    SELECT 'related' AS kind, NULL::float8 AS sort, json_build_array(${Prisma.join(ISSUE_LIST_RELATED_FIELDS.map(key => Prisma.raw(`"${key}"`)))})::text AS data
    FROM edge_issues
  `;
}

function presentIssue(issue: IssueListRow) {
  const { sourceRelations, targetRelations, ...fields } = issue;
  const issueRelations: RelationMap = buildIssueRelations(issue);
  return Object.assign(fields, { issueRelations });
}

type SnapshotRow = { kind: SnapshotKind; sort: number | null; data: string };

// The issue rows and shared records as PostgreSQL wrote them, newest issue first.
function snapshotText(workspaceId: string, rows: SnapshotRow[]) {
  const issues: { sort: number; data: string }[] = [];
  const shared = { projects: [] as string[], people: [] as string[], statuses: [] as string[], hierarchy: [] as string[], edges: [] as string[], related: [] as string[] };
  for (const { kind, sort, data } of rows) {
    if (kind === 'issues') issues.push({ sort: sort!, data });
    else shared[kind].push(data);
  }
  issues.sort((a, b) => b.sort - a.sort);
  const fields = { issues: ISSUE_LIST_FIELDS, hierarchy: ISSUE_LIST_HIERARCHY_FIELDS, edges: ISSUE_LIST_EDGE_FIELDS, related: ISSUE_LIST_RELATED_FIELDS };
  const tail = '],' + Object.entries(shared).map(([kind, records]) => `"${kind}":[${records.join(',')}]`).join(',')
    + `,"workspaceId":${JSON.stringify(workspaceId)},"fields":${JSON.stringify(fields)}}}`;
  return { issues: issues.map(issue => issue.data), tail };
}

// A browser tab loaded before rows were sent as arrays does not ask for them, and reads only the previous snapshot.
function previousSnapshotResponse(workspaceId: string, rows: SnapshotRow[]) {
  const { issues, tail } = snapshotText(workspaceId, rows);
  const { snapshot } = JSON.parse(`{"snapshot":{"issues":[${issues.join(',')}${tail}`) as { snapshot: IssueListSnapshot };
  return NextResponse.json({ snapshot: previousIssueListSnapshot(snapshot) });
}

// The rows go out as PostgreSQL wrote them, in batches.
function snapshotResponse(workspaceId: string, rows: SnapshotRow[]) {
  const { issues, tail } = snapshotText(workspaceId, rows);
  const encoder = new TextEncoder();
  let next = 0;
  function enqueueChunk(controller: ReadableStreamDefaultController<Uint8Array>) {
    const head = next === 0 ? '{"snapshot":{"issues":[' : ',';
    const batch = issues.slice(next, next += 256).join(',');
    const done = next >= issues.length;
    controller.enqueue(encoder.encode(head + batch + (done ? tail : '')));
    if (done) controller.close();
  }

  const body = new ReadableStream<Uint8Array>({
    start: enqueueChunk,
    pull(controller) {
      try {
        enqueueChunk(controller);
      } catch (error) {
        console.error('[ISSUES_GET]', error);
        controller.error(error);
      }
    },
  });
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
      select: { id: true },
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
    if (!milestoneId && searchParams.get('descriptions') === '1') {
      const [{ data }] = await prisma.$queryRaw<{ data: string }[]>(
        issueDescriptionQuery(session.user.id, workspaceId, projectIds, includeRequests),
      );
      return new Response(`{"descriptions":${data}}`, { headers: { 'content-type': 'application/json' } });
    }
    if (!milestoneId && projectIds.length !== 1) {
      const rows = await prisma.$queryRaw<SnapshotRow[]>(
        workspaceIssueQuery(session.user.id, workspaceId, projectIds, includeRequests),
      );
      return searchParams.get('rows') === 'arrays'
        ? snapshotResponse(workspaceId, rows)
        : previousSnapshotResponse(workspaceId, rows);
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

    // The write is committed: tell the notifier, without waiting for it.
    if (created.assigneeId) {
      tellIssueEvent({ kind: 'assigned', issueId: created.id, actorId: session.user.id, assigneeId: created.assigneeId });
    }

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
          tellIssueEvent({ kind: 'described', issueId: created.id, actorId: session.user.id, mentionedIds: recipients });
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
