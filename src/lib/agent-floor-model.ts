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
  content: string;
  claimedById: string | null;
  senderId: string | null;
  recipientIds: string[];
  updatedAt: string;
}
export interface FloorEvent {
  id: string;
  agentId: string;
  taskId: string;
  projectId: string;
  action: string;
  content: string;
  at: string;
}
export interface FloorSnapshot {
  workspace: { id: string; slug: string | null; name: string };
  projects: FloorProject[];
  agents: FloorAgent[];
  tasks: FloorTask[];
  events: FloorEvent[];
  generatedAt: string;
  limited: boolean;
}
export const RECENT_REPORT_MS = 5 * 60 * 1000;
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
/** Snapshot refreshes never replay historical activity, including after a reconnect. */
export function arrivingEvents(
  previous: FloorSnapshot,
  next: FloorSnapshot,
): FloorEvent[] {
  // A long gap is a resynchronisation, not a request to replay missed work.
  if (Date.parse(next.generatedAt) - Date.parse(previous.generatedAt) > 45000)
    return [];
  const seen = new Set(previous.events.map((event) => event.id));
  return next.events
    .filter((event) => !seen.has(event.id) && event.at > previous.generatedAt)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
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
    !/block|hold|wait/i.test(task.status) &&
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
