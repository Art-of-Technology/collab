import type { ForgeBoard } from "@/lib/forge/board";
import type { MemoryView } from "@/lib/forge/memory-service";
import { needsAttention } from "@/lib/forge/tasks";
import { PageLayout } from "@/components/ui/page-layout";
import { PageHeader } from "@/components/ui/page-header";

type Project = { id: string; slug: string; name: string };
type NativeIssue = { id: string; issueKey: string | null; title: string; status: string | null };
export type DashboardData = { kind: "denied" | "unavailable" } | {
  kind: "ready"; workspaceName: string; workspaceSlug: string; projects: Project[];
  selected: { project: Project; board: ForgeBoard; memory: MemoryView; nativeIssues: NativeIssue[] | null } | null;
};

const linkStyle = "text-sm underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4";
const cardStyle = "min-w-0 space-y-4 rounded-xl border border-border bg-card p-5";

function ReadState({ kind, label }: { kind: "denied" | "unavailable" | "not-connected"; label: string }) {
  return <p role="status" className="text-sm text-muted-foreground">{kind === "denied"
    ? `You do not have access to ${label}.`
    : kind === "not-connected" ? `${label} is not connected for this project.`
      : `${label} could not be loaded. Reload this overview to try again.`}</p>;
}

// Server-rendered overview: navigation reloads the selected scope without retaining client data.
export default function DashboardOverview({ data }: { data: DashboardData }) {
  if (data.kind !== "ready") return <PageLayout>
    <PageHeader title="Project overview" />
    <ReadState kind={data.kind} label="Project overview" />
  </PageLayout>;
  const { selected, projects, workspaceSlug } = data;
  const dashboardPath = `/${encodeURIComponent(workspaceSlug)}/dashboard`;
  const base = selected ? `/${encodeURIComponent(workspaceSlug)}/projects/${encodeURIComponent(selected.project.slug)}` : "";
  const board = selected?.board;
  const memory = selected?.memory;
  return <PageLayout>
    <PageHeader title="Project overview" subtitle={data.workspaceName} />
    <form action={dashboardPath} method="get" className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-2">
        <label htmlFor="overview-project" className="text-sm font-medium">Project</label>
        <select id="overview-project" name="project" defaultValue={selected?.project.id ?? ""} className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">Choose a project</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>
      <button type="submit" disabled={!projects.length} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Show project</button>
      {selected && <a className={linkStyle} href={`${dashboardPath}?project=${encodeURIComponent(selected.project.id)}`}>Reload overview</a>}
    </form>
    {!selected ? <p role="status" className="text-sm text-muted-foreground">{projects.length ? "Choose a project to see its issues and memory." : "No projects are available in this workspace."}</p> : <>
      <h2 className="text-lg font-medium break-words">{selected.project.name}</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-label="Issues" className={cardStyle}>
          <h3 className="font-medium">Issues</h3>
          {selected.nativeIssues !== null ? <>
            <p className="text-sm">Recent Collab issues</p>
            {selected.nativeIssues.length === 0 ? <p className="text-sm">No issues in this project yet.</p> : <ul className="space-y-2 text-sm">
              {selected.nativeIssues.map(issue => <li key={issue.id} className="break-words">
                <a className={linkStyle} href={`/${encodeURIComponent(workspaceSlug)}/issues/${encodeURIComponent(issue.id)}`}>{issue.issueKey} {issue.title}</a>
                {issue.status && <span className="text-muted-foreground"> · {issue.status}</span>}
              </li>)}
            </ul>}
          </> : board?.kind === "ready" ? <>
            <p className="text-sm">{board.tasks.length} loaded issues · {board.tasks.filter(task => needsAttention(task, board.today)).length} need attention</p>
            <p className="text-xs text-muted-foreground">Fetched {board.fetchedAt}</p>
            {board.truncated && <p role="status" className="text-sm">Partial result: only the first 1,000 issues were loaded. Counts are not repository totals.</p>}
            {board.tasks.length === 0 ? <p className="text-sm">No issues in this loaded result.</p> : <ul className="space-y-2 text-sm">
              {board.tasks.slice(0, 5).map(task => <li key={task.number} className="break-words">#{task.number} {task.title} <span className="text-muted-foreground">· {task.status}</span></li>)}
            </ul>}
          </> : board && <ReadState kind={board.kind} label="Issues" />}
          {selected.nativeIssues !== null ? <a className={linkStyle} href={base}>Open project</a>
            : board?.kind !== "denied" && <a className={linkStyle} href={`${base}/board`}>Open issue board</a>}
        </section>
        <section aria-label="Project memory" className={cardStyle}>
          <h3 className="font-medium">Project memory</h3>
          <p className="text-sm text-muted-foreground">Rules, Strategy, Decisions and Handoffs · Draft → Approved → Superseded</p>
          {memory?.kind === "ready" ? <>
            <p className="text-sm">{new Set(memory.snapshot.document.revisions.map(note => note.id)).size} notes · {memory.snapshot.document.revisions.filter(note => note.state === "Draft").length} draft revisions · {memory.snapshot.document.revisions.filter(note => note.state === "Approved").length} approved revisions</p>
            {memory.snapshot.document.revisions.length === 0 ? <p className="text-sm">No project memory revisions yet.</p> : <ul className="space-y-2 text-sm">
              {memory.snapshot.document.revisions.slice(0, 6).map(note => <li key={`${note.id}-${note.revision}`} className="break-words">{note.title} <span className="text-muted-foreground">· {note.type} · {note.state} · revision {note.revision}</span></li>)}
            </ul>}
            <p className="text-xs text-muted-foreground">Review the full revision list and approval details in project memory.</p>
          </> : memory && <ReadState kind={memory.kind} label="Project memory" />}
          {memory?.kind !== "denied" && <a className={linkStyle} href={`${base}/notes/memory`}>Review project memory</a>}
        </section>
      </div>
      <section aria-label="Ready review" className={cardStyle}>
        <h3 className="font-medium">Ready review</h3>
        <p className="text-sm text-muted-foreground">Open an issue to review its approved memory and configured Ready options. Ready does not grant merge or deploy permission. Execution availability and recorded attempts are shown per issue when configured.</p>
        {board?.kind === "ready" && memory?.kind === "ready" ? <a className={linkStyle} href={`${base}/board`}>Open an issue for Ready review</a> : <p role="status" className="text-sm">Ready review requires access to connected issues and project memory.</p>}
      </section>
    </>}
  </PageLayout>;
}
