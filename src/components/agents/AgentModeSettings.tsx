"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const GROUPS = { todo: "To do", in_progress: "In progress", in_review: "In review", blocked: "Blocked", done: "Done" } as const;
type Group = keyof typeof GROUPS;
interface AgentMode {
  mode: "handoffs" | "seats";
  switchedAt: string | null;
  statuses: { id: string; name: string; category: Group }[];
  claims: { issueId: string; issueKey: string | null; title: string; agent: string | null; assignee: string | null }[];
  carryTo: { name: string } | null;
  retire: string[];
}

/** How a project gives agents work: its status groups, and the switch between handoffs and seats. */
export function AgentModeSettings({ workspaceId, projectSlug }: { workspaceId: string; projectSlug: string }) {
  const { toast } = useToast();
  const url = `/api/workspaces/${workspaceId}/projects/${projectSlug}/agent-mode`;
  const [state, setState] = useState<AgentMode | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Regrouped statuses not saved yet, and the claims left out of the carry-over.
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [left, setLeft] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(url).then(async response => {
      if (response.ok) setState(await response.json());
      else setProblem(response.status === 403 ? "Only someone who manages this workspace's agents can change how this project gives them work." : "This could not be loaded.");
    }).catch(() => setProblem("This could not be loaded."));
  }, [url]);

  if (!state) return <p className="text-sm text-collab-500">{problem ?? "Loading..."}</p>;

  const seats = state.mode === "seats";
  const statuses = state.statuses.map(status => ({ ...status, category: groups[status.id] ?? status.category }));
  const missing = (["in_progress", "done"] as const).filter(group => !statuses.some(status => status.category === group));
  const carried = state.carryTo ? state.claims.filter(claim => !left.includes(claim.issueId)) : [];

  const save = async (change: { mode?: AgentMode["mode"]; carryOver?: string[] }) => {
    setBusy(true);
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...change, ...(Object.keys(groups).length && { categories: groups }) }) });
      const body = await response.json();
      if (!response.ok) return toast({ title: "Error", description: body.error ?? "This could not be saved.", variant: "destructive" });
      setState(body);
      setGroups({});
      setLeft([]);
      toast({ title: change.mode ? (change.mode === "seats" ? "This project uses seats now" : "This project uses handoffs again") : "Status groups saved" });
    } catch {
      toast({ title: "Error", description: "This could not be saved.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-collab-800 border border-collab-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-collab-700">
        <h2 className="text-sm font-medium text-collab-50">Agents</h2>
        <p className="text-xs text-collab-500/60 mt-0.5">
          {seats
            ? `This project uses seats${state.switchedAt ? ` since ${new Date(state.switchedAt).toLocaleDateString()}` : ""}. Work reaches an agent as an issue assigned to its seat. Handoffs on its issues are refused, and the Release request and Review request labels file a request for the seat of that role.`
            : "This project uses handoffs. With seats, work reaches an agent only as an issue assigned to its seat, in this project."}
        </p>
      </div>
      <div className="p-6 space-y-3">
        <p className="text-xs text-collab-500">
          A run moves its issue by group: to an In progress status when it starts, and to a status of its outcome when it ends. Check the group of each status.
        </p>
        {statuses.map(status => (
          <div key={status.id} className="flex items-center gap-3 p-3 rounded-xl bg-collab-900 border border-collab-700">
            <span className="text-sm text-collab-50 flex-1">{status.name}</span>
            <Select value={status.category} onValueChange={value => setGroups({ ...groups, [status.id]: value as Group })}>
              <SelectTrigger className="w-40 h-8" aria-label={`Group of ${status.name}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GROUPS).map(([group, label]) => <SelectItem key={group} value={group}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        {state.retire.length > 0 && (
          <p className="text-xs text-collab-500">
            These agent names hold claims only in this project. Once it uses seats they have no further use; retire each with
            {" "}<code>collab agents retire --agent NAME</code>: {state.retire.join(", ")}.
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" disabled={busy || !Object.keys(groups).length} onClick={() => save({})}>Save groups</Button>
          <Button disabled={busy} onClick={() => setConfirming(true)}>{seats ? "Switch back to handoffs" : "Switch to seats"}</Button>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="bg-collab-800 border-collab-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-collab-50">{seats ? "Switch this project back to handoffs?" : "Switch this project to seats?"}</AlertDialogTitle>
            <AlertDialogDescription className="text-collab-500">
              {seats
                ? "Handoffs work again on this project's issues, and its labels go to their subscribers. Seats and their issues stay as they are. This is refused while a run is open."
                : "From then on nobody can send or claim a handoff on this project's issues, and a label no longer hands an issue to its subscribers. Old handoffs stay readable. Adding the Release request or Review request label files a request for the seat of that role."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!seats && (
            <div className="space-y-3 text-sm text-collab-50">
              <ul className="space-y-1">
                {statuses.map(status => (
                  <li key={status.id} className="flex justify-between gap-3">
                    <span>{status.name}</span><span className="text-collab-500">{GROUPS[status.category]}</span>
                  </li>
                ))}
              </ul>
              {missing.length > 0 && (
                <p className="text-red-400">
                  No status is in the {missing.map(group => GROUPS[group]).join(" or the ")} group. Cancel, set the groups, and switch then.
                </p>
              )}
              {state.claims.length > 0 && (
                <div className="space-y-1">
                  <p className="text-collab-500">
                    {state.carryTo
                      ? `Claimed in the last seven days. The ticked issues are assigned to ${state.carryTo.name}:`
                      : "Claimed in the last seven days. This project has no developer seat, so these stay with whoever they are assigned to:"}
                  </p>
                  {state.claims.map(claim => (
                    <label key={claim.issueId} className="flex items-center gap-2">
                      {state.carryTo && (
                        <Checkbox checked={!left.includes(claim.issueId)}
                          onCheckedChange={checked => setLeft(checked ? left.filter(issueId => issueId !== claim.issueId) : [...left, claim.issueId])} />
                      )}
                      <span>{claim.issueKey} {claim.title}</span>
                      <span className="text-collab-500">{claim.agent}{claim.assignee ? `, assigned to ${claim.assignee}` : ""}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-collab-700 text-collab-500 hover:bg-collab-700 hover:text-collab-50">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!seats && missing.length > 0}
              onClick={() => save(seats ? { mode: "handoffs" } : { mode: "seats", ...(carried.length && { carryOver: carried.map(claim => claim.issueId) }) })}>
              {seats ? "Switch back to handoffs" : "Switch to seats"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
