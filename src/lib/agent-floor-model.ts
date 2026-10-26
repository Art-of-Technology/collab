/** Serializable, permission-filtered read model. No execution/presence claims. */
export interface FloorProject {
  id: string;
  name: string;
  color: string | null;
  statuses: { id: string; name: string; isFinal: boolean }[];
}
export interface FloorAgent {
  id: string;
  name: string;
}
export interface FloorTask {
  id: string;
  issueId: string;
  issueKey: string;
  title: string;
  projectId: string;
  status: string;
  final: boolean;
  handoffState: string;
  contentHtml: string;
  claimedById: string | null;
  senderId: string | null;
  recipientIds: string[];
  updatedAt: string;
}
export interface FloorEvent {
  id: string;
  agentId: string | null;
  taskId: string;
  projectId: string;
  action: string;
  contentHtml: string;
  at: string;
}
export interface FloorSnapshot {
  workspace: { id: string; slug: string | null; name: string };
  projects: FloorProject[];
  projectPage: {
    page: number;
    search: string;
    projectId: string;
    hasMore: boolean;
  };
  agents: FloorAgent[];
  tasks: FloorTask[];
  events: FloorEvent[];
  generatedAt: string;
  limited: boolean;
}
export const RECENT_REPORT_MS = 5 * 60 * 1000;
export const PROJECT_PAGE_SIZE = 6;
const EVENT_OVERLAP_MS = 45000;
export interface FloorAnimation {
  event: FloorEvent;
  elapsed: number;
  origin?: number;
}
export interface FloorPlayback {
  seen: Map<string, string>;
  queues: Map<string, FloorAnimation[]>;
}
export const floorActorKey = (projectId: string, agentId: string) =>
  `${projectId}:${agentId}`;
export function createFloorPlayback(initial: FloorSnapshot): FloorPlayback {
  return {
    seen: new Map(initial.events.map((event) => [event.id, event.at])),
    queues: new Map(),
  };
}
export const eventLabels: Record<string, string> = {
  AGENT_SENT: "Sent a handoff",
  AGENT_LABEL_ADDED: "Label routed work",
  AGENT_CLAIM: "Claimed work",
  AGENT_PROGRESS: "Reported progress",
  AGENT_PASSED: "Passed work on",
  AGENT_COMPLETE: "Completed handoff",
  AGENT_RELEASE: "Released claim",
  AGENT_ACKNOWLEDGED: "Acknowledged",
};
export function arrivingEvents(
  previous: FloorSnapshot,
  next: FloorSnapshot,
  seen: Map<string, string>,
): FloorEvent[] {
  const cutoff = Date.parse(previous.generatedAt) - EVENT_OVERLAP_MS;
  const baseline =
    Date.parse(next.generatedAt) - Date.parse(previous.generatedAt) > EVENT_OVERLAP_MS ||
    previous.projectPage.page !== next.projectPage.page ||
    previous.projectPage.search !== next.projectPage.search ||
    previous.projectPage.projectId !== next.projectPage.projectId;
  for (const event of previous.events) seen.set(event.id, event.at);
  const incoming = next.events.filter((event) => {
    const unseen = !seen.has(event.id);
    seen.set(event.id, event.at);
    return !baseline && unseen && Date.parse(event.at) >= cutoff;
  });
  for (const [id, at] of seen)
    if (Date.parse(at) < cutoff) seen.delete(id);
  return incoming.sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  );
}
export function updateFloorPlayback(
  playback: FloorPlayback,
  previous: FloorSnapshot,
  next: FloorSnapshot,
  animate: boolean,
) {
  if (
    !animate ||
    Date.parse(next.generatedAt) - Date.parse(previous.generatedAt) > EVENT_OVERLAP_MS
  )
    playback.queues.clear();
  for (const event of arrivingEvents(previous, next, playback.seen)) {
    if (
      !animate || !event.agentId ||
      !["AGENT_CLAIM", "AGENT_PASSED", "AGENT_COMPLETE"].includes(event.action)
    )
      continue;
    const key = floorActorKey(event.projectId, event.agentId);
    const queue = playback.queues.get(key) || [];
    queue.push({ event, elapsed: 0 });
    playback.queues.set(key, queue);
  }
  const loadedProjects = new Set(next.projects.map((project) => project.id));
  const availableTasks = new Set(next.tasks.map((task) => task.id));
  for (const [key, queue] of playback.queues) {
    const pending = queue.filter(
      ({ event }) =>
        (!loadedProjects.has(event.projectId) || availableTasks.has(event.taskId)) &&
        Date.parse(next.generatedAt) - Date.parse(event.at) < RECENT_REPORT_MS,
    );
    if (pending.length) playback.queues.set(key, pending);
    else playback.queues.delete(key);
  }
}
export function agentReport(
  snapshot: FloorSnapshot,
  agentId: string,
  now: number,
  projectId?: string,
) {
  const tasks = snapshot.tasks.filter(
    (task) =>
      task.claimedById === agentId &&
      task.handoffState === "claimed" &&
      (!projectId || task.projectId === projectId),
  );
  const event = snapshot.events.find(
    (e) => e.agentId === agentId && (!projectId || e.projectId === projectId),
  );
  const age = event ? now - Date.parse(event.at) : Infinity;
  const task = event && tasks.find((t) => t.id === event.taskId);
  const recent = age >= 0 && age < RECENT_REPORT_MS;
  const typing =
    !!task &&
    recent &&
    !task.final &&
    ["AGENT_CLAIM", "AGENT_PROGRESS"].includes(event!.action);
  return {
    tasks,
    event,
    typing,
    label: typing
      ? "Recent work report"
      : tasks.length
        ? "Claimed · awaiting update"
        : "No claimed work in this view",
  };
}
