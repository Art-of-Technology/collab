"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  agentReport,
  createFloorPlayback,
  updateFloorPlayback,
  eventLabels,
  PROJECT_PAGE_SIZE,
} from "@/lib/agent-floor-model";
import type { FloorSnapshot } from "@/lib/agent-floor-model";

const FloorScene = dynamic(() => import("./FloorScene"), {
  ssr: false,
  loading: () => (
    <p className="p-8 text-sm">Preparing the organisation floor…</p>
  ),
});
const timestamp = (value: string) =>
  `${value.slice(0, 19).replace("T", " ")} UTC`;
export function OrganisationFloor({ initial }: { initial: FloorSnapshot }) {
  const [snapshot, setSnapshot] = useState<FloorSnapshot | null>(initial);
  const current = useRef(initial);
  const [project, setProject] = useState(initial.projectPage.projectId);
  const [page, setPage] = useState(initial.projectPage.page);
  const [search, setSearch] = useState(initial.projectPage.search);
  const [selected, setSelected] = useState("");
  const [playback] = useState(() => createFloorPlayback(initial));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"floor" | "list">("floor");
  const [motion, setMotion] = useState(false);
  const motionEnabled = useRef(false);
  const [now, setNow] = useState(Date.now());
  const refresh = useRef<() => void>(() => {});
  const base = `/${encodeURIComponent(initial.workspace.slug || initial.workspace.id)}`;
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    setMotion(!preference.matches);
    const change = () => setMotion(!preference.matches);
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    motionEnabled.current = motion;
    if (!motion || error) playback.queues.clear();
  }, [motion, error, playback]);
  useEffect(() => {
    let stopped = false,
      running = false;
    let controller: AbortController | undefined;
    const read = async () => {
      if (running || stopped || document.hidden) return;
      running = true;
      setBusy(true);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const query = new URLSearchParams({
          page: String(page), search, projectId: project,
        });
        const response = await fetch(
          `/api/workspaces/${encodeURIComponent(initial.workspace.id)}/agent-floor?${query}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (stopped) return;
        if (response.status === 401 || response.status === 404) {
          setSnapshot(null);
          playback.queues.clear();
          setError(
            "Access changed. Sign in again or choose a workspace you can access.",
          );
          stopped = true;
          return;
        }
        if (!response.ok) throw new Error("unavailable");
        const next: FloorSnapshot = await response.json();
        if (stopped) return;
        updateFloorPlayback(
          playback, current.current, next, motionEnabled.current,
        );
        current.current = next;
        setSnapshot(next);
        setError("");
        setNow(Date.now());
      } catch {
        if (!stopped) {
          setError(
            "Refresh failed. Showing the last snapshot; animation is paused.",
          );
          playback.queues.clear();
        }
      } finally {
        clearTimeout(timeout);
        running = false;
        if (!stopped) setBusy(false);
      }
    };
    refresh.current = () => {
      void read();
    };
    if (
      current.current.projectPage.page !== page ||
      current.current.projectPage.search !== search.trim() ||
      current.current.projectPage.projectId !== project
    ) void read();
    const timer = setInterval(() => {
      setNow(Date.now());
      void read();
    }, 20000);
    const visible = () => {
      if (!document.hidden) void read();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [initial.workspace.id, page, search, project, playback]);
  const selectProject = useCallback((id: string) => {
    setProject(id);
    setPage(0);
    setSearch("");
  }, []);
  const chooseAgent = useCallback((id: string) => setSelected(id), []);
  if (!snapshot)
    return (
      <main className="p-8">
        <h1 className="text-2xl font-semibold">Organisation floor</h1>
        <p role="alert" className="mt-4">
          {error}
        </p>
        <Link href="/login">Sign in</Link>
      </main>
    );
  const projects = snapshot.projects;
  const visibleProject = snapshot.projectPage.projectId;
  const tasks = snapshot.tasks.filter(
    (t) => !visibleProject || t.projectId === visibleProject,
  );
  const agents = snapshot.agents.filter(
    (a) =>
      !visibleProject ||
      tasks.some(
        (t) =>
          t.claimedById === a.id ||
          t.senderId === a.id ||
          t.recipientIds.includes(a.id),
      ),
  );
  const agent = agents.find((a) => a.id === selected);
  const activity = snapshot.events.filter(
    (e) =>
      (!visibleProject || e.projectId === visibleProject) &&
      (!agent || e.agentId === agent.id),
  );
  const selectedTasks = tasks.filter(
    (t) =>
      !agent ||
      t.claimedById === agent.id ||
      t.senderId === agent.id ||
      t.recipientIds.includes(agent.id),
  );
  const names = new Map(snapshot.agents.map((a) => [a.id, a.name]));
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-muted-foreground hover:underline"
            href={`${base}/agent-inbox`}
          >
            ← Agent inbox
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {snapshot.workspace.name} · Organisation floor
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Real agents, projects and recorded handoffs. Motion illustrates
            reports; it does not monitor execution or change tasks.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => refresh.current()}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Project
          <select
            value={project}
            onChange={(e) => selectProject(e.target.value)}
            className="mt-1 block h-10 max-w-72 rounded-md border bg-background px-3"
          >
            <option value="">Browse all projects</option>
            {snapshot.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Find a room
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setProject("");
              setPage(0);
            }}
            maxLength={200}
            placeholder="Search projects…"
            className="mt-1 block h-10 rounded-md border bg-background px-3"
          />
        </label>
        <div className="flex gap-1" aria-label="Display">
          <Button
            variant={view === "floor" ? "default" : "outline"}
            aria-pressed={view === "floor"}
            onClick={() => setView("floor")}
          >
            3D floor
          </Button>
          <Button
            variant={view === "list" ? "default" : "outline"}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            List
          </Button>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={motion}
            onChange={(e) => setMotion(e.target.checked)}
          />
          Animate reports
        </label>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {error ||
          `Snapshot ${timestamp(snapshot.generatedAt)} · refreshes every 20 seconds while visible · ${agents.length} registered agents${visibleProject ? " linked to this project" : ""}`}
      </p>
      {snapshot.limited && (
        <p className="rounded-md border p-3 text-sm">
          Bounded view: latest 200 handoffs and 500 events for these rooms,
          up to 200 registered agents. Open an issue for its
          complete timeline.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-3" aria-label="Project rooms">
          {view === "floor" && (
            <div className="overflow-hidden rounded-xl border bg-[#17212e]">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-slate-200">
                <span>
                  Drag to rotate · scroll to zoom · select a person or room
                </span>
                <span>
                  Page {snapshot.projectPage.page + 1} · {projects.length} rooms
                </span>
              </div>
              <FloorScene
                snapshot={snapshot}
                projects={projects}
                selected={selected}
                animate={motion && !error}
                playback={playback}
                onAgent={chooseAgent}
                onProject={selectProject}
              />
            </div>
          )}
          {(snapshot.projectPage.page > 0 || snapshot.projectPage.hasMore) && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                disabled={busy || page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous rooms
              </Button>
              <span className="text-sm">
                Page {snapshot.projectPage.page + 1} · up to {PROJECT_PAGE_SIZE} rooms
              </span>
              <Button
                variant="outline"
                disabled={busy || !snapshot.projectPage.hasMore}
                onClick={() => setPage(page + 1)}
              >
                Next rooms
              </Button>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const linked = snapshot.tasks.filter((t) => t.projectId === p.id);
              const claims = linked.filter((t) => t.handoffState === "claimed");
              return (
                <button
                  key={p.id}
                  onClick={() => selectProject(p.id)}
                  className="rounded-lg border bg-card p-4 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <h2 className="font-medium">{p.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Set(claims.map((t) => t.claimedById)).size} claimants ·{" "}
                    {claims.length} claimed handoffs
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {linked.length
                      ? `${linked.length} recent handoffs`
                      : "No agent handoffs in this snapshot"}
                  </p>
                </button>
              );
            })}
          </div>
          {!projects.length && (
            <p className="rounded-lg border p-6 text-sm">
              No matching projects.
            </p>
          )}
        </section>
        <aside
          className="rounded-xl border bg-card p-4"
          aria-label="Registered agents"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Registered agents</h2>
            <button
              className="text-xs underline"
              onClick={() => setSelected("")}
            >
              Show all
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Names identify agents, not people or projects.
          </p>
          <div className="mt-4 max-h-[480px] space-y-2 overflow-auto">
            {agents.map((a) => {
              const report = agentReport(
                snapshot,
                a.id,
                now,
                visibleProject || undefined,
              );
              return (
                <button
                  key={a.id}
                  aria-pressed={selected === a.id}
                  onClick={() => setSelected(a.id)}
                  className={`w-full rounded-lg border p-3 text-left ${selected === a.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                >
                  <span className="block break-words text-sm font-medium">
                    {a.name}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {error ? "Snapshot stale" : report.label}
                  </span>
                  <span className="mt-1 block text-xs">
                    {report.tasks.length} claimed handoffs
                  </span>
                  {a.worker && <span className="mt-1 block text-xs">{!error && a.worker.online && Date.parse(a.worker.leaseUntil || '') > now ? (a.worker.working ? 'Child working' : 'Daemon online') : 'Daemon offline'} · {a.worker.state}{a.worker.usage && ` · estimated $${a.worker.usage.estimatedUSD.toFixed(2)} · reserved $${a.worker.usage.reservedUSD.toFixed(2)}`}</span>}
                </button>
              );
            })}
            {!agents.length && (
              <p className="text-sm text-muted-foreground">
                No registered agents linked here. Registration alone does not
                assign a project or task.
              </p>
            )}
          </div>
        </aside>
      </div>
      <section className="space-y-3" aria-label="Task board">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">
            {agent ? `${agent.name} · tasks` : "Task board"}
          </h2>
          {visibleProject && (
            <Button variant="ghost" onClick={() => selectProject("")}>
              All projects
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Columns are issue statuses. Claim and completion badges refer to
          handoffs; completing a handoff does not automatically complete the
          issue.
        </p>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {Array.from(
            new Set([
              ...(visibleProject
                ? projects.flatMap((p) => p.statuses.map((s) => s.name))
                : []),
              ...selectedTasks.map((t) => t.status),
            ]),
          ).map((status) => (
            <div
              key={status}
              className="min-w-[270px] max-w-[340px] flex-1 rounded-xl border bg-muted/20 p-3"
            >
              <h3 className="mb-3 text-sm font-semibold">
                {status}{" "}
                <span className="text-muted-foreground">
                  {selectedTasks.filter((t) => t.status === status).length}
                </span>
              </h3>
              {selectedTasks
                .filter((t) => t.status === status)
                .map((t) => (
                  <article
                    key={t.id}
                    className="mb-3 space-y-2 rounded-lg border bg-card p-3 text-sm"
                  >
                    <Link
                      href={`${base}/issues/${encodeURIComponent(t.issueKey)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {t.issueKey} · {t.title}
                    </Link>
                    <p>Handoff: {t.handoffState}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.claimedById
                        ? `Claimed by ${names.get(t.claimedById) || "unavailable agent"}`
                        : "Unclaimed"}{" "}
                      · From {names.get(t.senderId || "") || "label trigger"}
                    </p>
                    <details>
                      <summary className="cursor-pointer text-xs">
                        Handoff and next steps
                      </summary>
                      <div
                        className="prose prose-sm dark:prose-invert mt-2 max-w-none break-words [&_img]:max-w-full"
                        dangerouslySetInnerHTML={{ __html: t.contentHtml }}
                      />
                    </details>
                  </article>
                ))}
            </div>
          ))}
        </div>
        {!selectedTasks.length && (
          <p className="text-sm text-muted-foreground">
            No linked handoffs in this snapshot.
          </p>
        )}
      </section>
      <section className="rounded-xl border p-5">
        <h2 className="text-lg font-semibold">
          {agent ? `${agent.name} · important events` : "Organisation timeline"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Newest first · recorded actions, not inferred activity · select an
          agent or project to narrow.
        </p>
        <ol className="mt-4 max-h-[600px] divide-y overflow-auto">
          {activity.map((event) => {
            const task = snapshot.tasks.find((t) => t.id === event.taskId)!;
            return (
              <li key={event.id} className="py-4">
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span>
                    <strong>
                      {event.agentId ? names.get(event.agentId) : "System · label routing"}
                    </strong> ·{" "}
                    {eventLabels[event.action] ||
                      event.action
                        .replace(/^AGENT_/, "")
                        .toLowerCase()
                        .replaceAll("_", " ")}
                  </span>
                  <time
                    className="text-xs text-muted-foreground"
                    dateTime={event.at}
                  >
                    {timestamp(event.at)}
                  </time>
                </div>
                <Link
                  className="text-sm text-primary hover:underline"
                  href={`${base}/issues/${encodeURIComponent(task.issueKey)}`}
                >
                  {task.issueKey} · {task.title}
                </Link>
                {event.contentHtml && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer">
                      Report / evidence
                    </summary>
                    <div
                      className="prose prose-sm dark:prose-invert mt-2 max-w-none break-words [&_img]:max-w-full"
                      dangerouslySetInnerHTML={{ __html: event.contentHtml }}
                    />
                  </details>
                )}
              </li>
            );
          })}
        </ol>
        {!activity.length && (
          <p className="mt-4 text-sm text-muted-foreground">
            No recorded agent events in this view.
          </p>
        )}
      </section>
    </main>
  );
}
