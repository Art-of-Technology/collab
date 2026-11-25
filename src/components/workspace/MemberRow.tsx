"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mail, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkspaceRole, getRoleDisplayName } from "@/lib/permission-types";
import type { WorkspaceLevel } from "@/lib/workspace-authority";
import { removeWorkspaceMember } from "@/actions/workspace";

export interface MemberRowMember {
  id: string;
  role: string;
  status: boolean;
  level: WorkspaceLevel;
  agent: boolean;
  mayAct: boolean;
  user: { id: string; name: string | null; email: string | null; useCustomAvatar?: boolean } & Record<string, unknown>;
}

interface MemberRowProps {
  readonly member: MemberRowMember;
  /** The resolved workspace id, which the member paths need. */
  readonly workspaceId: string;
  /** The id or slug in the page's address, for the link to the member's other workspaces. */
  readonly routeWorkspaceId: string;
  readonly workspaceName: string;
  readonly rolesViewerMayGrant: string[];
  /** Admin or above: the row menu switches and removes. */
  readonly viewerManages: boolean;
  /** A platform admin who is not a member keeps the switch this screen gave them before. */
  readonly platformAdmin: boolean;
  readonly canSeeOtherWorkspaces: boolean;
  /** The screen keeps one row menu open at a time. */
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly onChange: (memberId: string, patch: Partial<MemberRowMember> | null) => void;
  readonly onMessage: (message: string) => void;
}

function builtInRole(role: string): WorkspaceRole | undefined {
  const name = role.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(WorkspaceRole, name)) return name as WorkspaceRole;
}

/** A role's display name: built-in roles in any letter case by their name, custom roles as written. */
export function roleName(role: string): string {
  const name = builtInRole(role);
  if (!name) return role;
  return name === WorkspaceRole.ADMIN ? "Admin" : getRoleDisplayName(name);
}

async function refusal(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export default function MemberRow({
  member, workspaceId, routeWorkspaceId, workspaceName, rolesViewerMayGrant, viewerManages, platformAdmin, canSeeOtherWorkspaces, open, onOpen, onChange, onMessage,
}: MemberRowProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  const name = member.user.name || member.user.email || "This member";
  const primaryOwner = member.level === "PRIMARY_OWNER";
  const editsRole = member.mayAct && member.status && rolesViewerMayGrant.length > 0;
  const hasMenu = (member.mayAct && viewerManages) || (platformAdmin && !primaryOwner && !member.agent);

  // Keyboard focus follows the inline confirmation in and back out.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (asked.current) askRef.current?.focus();
    asked.current = confirming;
  }, [confirming]);

  const changeRole = async (role: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}/role`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      if (!response.ok) return onMessage(await refusal(response, "The role was not changed."));
      onChange(member.id, { role });
      onMessage(`${name} is now ${roleName(role)}.`);
    } catch {
      onMessage("Could not confirm the role change. Reload the page to check.");
    } finally { setBusy(false); }
  };

  const switchStatus = async () => {
    const status = !member.status;
    setBusy(true);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${member.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!response.ok) return onMessage(await refusal(response, "The member was not switched."));
      onChange(member.id, { status });
      onMessage(`${name} is now ${status ? "active" : "inactive"}.`);
    } catch {
      onMessage("Could not confirm the status change. Reload the page to check.");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removeWorkspaceMember({ workspaceId, userId: member.user.id });
      onMessage(`${name} was removed from ${workspaceName}.`);
      onChange(member.id, null);
    } catch {
      // A production build hides the sentence a server action throws, so this line does not depend on it.
      onMessage(`${name} was not removed. Reload the page to see who is here now.`);
    } finally { setBusy(false); }
  };

  let role: React.ReactNode;
  if (primaryOwner) role = <Badge className="bg-blue-500 text-white h-5 px-2 text-xs">Primary owner</Badge>;
  else if (member.agent) role = <Badge variant="outline" className="h-5 px-2 text-xs text-collab-500">no role</Badge>;
  else if (!member.status) {
    const label = `Inactive · ${roleName(member.role)}`;
    role = <Badge variant="outline" title={label} className="min-w-0 h-5 px-2 text-xs text-collab-500"><span className="truncate">{label}</span></Badge>;
  } else if (editsRole) role = (
    <Select value={builtInRole(member.role) ?? member.role} onValueChange={changeRole} disabled={busy}>
      <SelectTrigger aria-label={`Role of ${name}`} title={roleName(member.role)} className="h-7 w-40 text-xs [&>span]:truncate [&>svg]:shrink-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        {rolesViewerMayGrant.map((grant) => <SelectItem key={grant} value={grant}>{roleName(grant)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  else {
    const label = roleName(member.role);
    role = <Badge variant="outline" title={label} className="min-w-0 h-5 px-2 text-xs"><span className="truncate">{label}</span></Badge>;
  }

  return (
    <div onKeyDown={(event) => { if (event.key === "Escape" && open) { onOpen(false); menuRef.current?.focus(); } }}>
      {/* On a narrow screen the role and the menu move under the name instead of squeezing it. */}
      <div data-member className="p-3 border border-collab-700 rounded flex flex-wrap justify-between items-center gap-2 hover:bg-collab-800 transition-colors">
        <div className={`flex items-center gap-2.5 min-w-0 flex-1 basis-56 ${member.status ? "" : "opacity-50"}`}>
          {member.user.useCustomAvatar ? (
            <CustomAvatar user={member.user as never} size="lg" className="h-8 w-8 border border-collab-700" />
          ) : (
            <UserAvatar user={member.user as never} size="lg" className="border border-collab-700" />
          )}
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">
              {member.user.name}
              {member.agent && <span className="text-xs text-collab-500 font-normal"> · agent seat</span>}
            </div>
            {member.user.email && (
              <div className="text-xs text-collab-500 flex items-center gap-1 min-w-0">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{member.user.email}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto whitespace-nowrap max-w-full min-w-0">
          {role}
          {hasMenu && (
            <Button ref={menuRef} variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" aria-label={`More actions for ${name}`} aria-expanded={open}
              onClick={() => { onOpen(!open); setConfirming(false); }}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {hasMenu && open && (
        <div className="flex flex-wrap items-center gap-2 py-2 pl-12 pr-3 text-sm">
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={busy} onClick={switchStatus}>
            {member.status ? "Deactivate" : "Activate"}
          </Button>
          {canSeeOtherWorkspaces && member.status && (
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <Link href={`/workspaces/${routeWorkspaceId}/settings/members/${member.user.id}`}>Other workspaces</Link>
            </Button>
          )}
          {member.mayAct && member.status && (confirming ? (
            <>
              <span>Remove {name} from {workspaceName}?</span>
              <Button variant="destructive" size="sm" className="h-7 text-xs" disabled={busy} onClick={remove}>Remove</Button>
              <Button ref={cancelRef} variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
            </>
          ) : (
            <Button ref={askRef} variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirming(true)}>Remove from workspace…</Button>
          ))}
        </div>
      )}
    </div>
  );
}
