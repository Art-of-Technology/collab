import "server-only";
import { prisma } from "@/lib/prisma";
import { postWorkspaceAccessWhere } from "@/lib/post-access";
import { issueAccessWhere, issueReadAccessWhere } from "@/lib/issue-finder";
import type { FloorSnapshot, FloorEvent } from "@/lib/agent-floor-model";

const LIMIT = 200;
/** All entry points use this scope, including polling after membership revocation. */
export async function readAgentFloor(
  userId: string,
  workspaceId: string,
): Promise<FloorSnapshot | null> {
  if (!userId) return null;
  const workspace = await prisma.workspace.findFirst({
    where: postWorkspaceAccessWhere(userId, workspaceId),
    select: { id: true, slug: true, name: true },
  });
  if (!workspace) return null;
  const generatedAt = new Date().toISOString();
  const [projectRows, agentRows] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId: workspace.id, ...issueAccessWhere(userId) },
      select: {
        id: true,
        name: true,
        color: true,
        statuses: {
          orderBy: { order: "asc" },
          select: { id: true, displayName: true, isFinal: true },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: LIMIT + 1,
    }),
    prisma.agentRegistration.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true, userId: true, labelIds: true },
      orderBy: { name: "asc" },
      take: LIMIT + 1,
    }),
  ]);
  const agents = agentRows.slice(0, LIMIT);
  const projects = projectRows.slice(0, LIMIT);
  const scope = (id: string) => ({
    AND: [
      issueReadAccessWhere(id),
      { workspaceId: workspace.id, project: { workspaceId: workspace.id } },
    ],
  });
  // Preserve the inbox's recipient + viewer access intersection. User IDs and label subscriptions stay on the server.
  const eligible = agents.map((agent) => ({
    issue: scope(agent.userId),
    OR: [
      { claimedById: agent.id },
      { senderId: agent.id },
      { recipientNames: { has: agent.name } },
      ...(agent.labelIds.length
        ? [{ labelIds: { hasSome: agent.labelIds } }]
        : []),
    ],
  }));
  const rows = eligible.length
    ? await prisma.agentHandoff.findMany({
        where: {
          workspaceId: workspace.id,
          issue: {
            AND: [
              scope(userId),
              { projectId: { in: projects.map((p) => p.id) } },
            ],
          },
          OR: eligible,
        },
        select: {
          id: true,
          content: true,
          status: true,
          claimedById: true,
          senderId: true,
          recipientNames: true,
          labelIds: true,
          updatedAt: true,
          issue: {
            select: {
              id: true,
              issueKey: true,
              title: true,
              projectId: true,
              status: true,
              projectStatus: { select: { displayName: true, isFinal: true } },
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: LIMIT + 1,
      })
    : [];
  const tasks = rows.slice(0, LIMIT).map((row) => ({
    id: row.id,
    issueId: row.issue.id,
    issueKey: row.issue.issueKey || row.issue.id,
    title: row.issue.title,
    projectId: row.issue.projectId,
    status:
      row.issue.projectStatus?.displayName || row.issue.status || "Unspecified",
    final: row.issue.projectStatus?.isFinal || false,
    handoffState: row.status,
    content: row.content,
    claimedById: row.claimedById,
    senderId: row.senderId,
    recipientIds: agents
      .filter(
        (a) =>
          row.recipientNames.includes(a.name) ||
          a.labelIds.some((l) => row.labelIds.includes(l)),
      )
      .map((a) => a.id),
    updatedAt: row.updatedAt.toISOString(),
  }));
  const activities = tasks.length
    ? await prisma.issueActivity.findMany({
        where: {
          workspaceId: workspace.id,
          itemType: "ISSUE",
          itemId: { in: tasks.map((t) => t.issueId) },
          projectId: { in: projects.map((p) => p.id) },
          action: { startsWith: "AGENT_" },
        },
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          itemId: true,
          projectId: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 501,
      })
    : [];
  const events: FloorEvent[] = [];
  const agentIds = new Set(agents.map((a) => a.id));
  for (const row of activities.slice(0, 500)) {
    try {
      const detail = JSON.parse(row.details || "{}");
      const task = tasks.find(
        (t) =>
          t.id === detail.handoffId &&
          t.issueId === row.itemId &&
          t.projectId === row.projectId,
      );
      if (!task || !agentIds.has(detail.agent?.id)) continue;
      events.push({
        id: row.id,
        agentId: detail.agent.id,
        taskId: task.id,
        projectId: task.projectId,
        action: row.action,
        content: typeof detail.content === "string" ? detail.content : "",
        at: row.createdAt.toISOString(),
      });
    } catch {
      /* Legacy malformed activity is not executable data. */
    }
  }
  return {
    workspace,
    projects: projects.map((p) => ({
      ...p,
      statuses: p.statuses.map((s) => ({
        id: s.id,
        name: s.displayName,
        isFinal: s.isFinal,
      })),
    })),
    agents: agents.map((a) => ({ id: a.id, name: a.name })),
    tasks,
    events,
    generatedAt,
    limited:
      rows.length > LIMIT ||
      projectRows.length > LIMIT ||
      agentRows.length > LIMIT ||
      activities.length > 500,
  };
}
