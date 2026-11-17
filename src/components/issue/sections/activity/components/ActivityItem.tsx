"use client";

import { formatDistanceToNow } from "date-fns";
import { useParams } from "next/navigation";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { ActivityItemProps } from "../types/activity";
import { ActivityIcon } from "./ActivityIcon";
import { ActivityChangeDetails } from "./ActivityChangeDetails";
import { getActionDisplayName, getActionText, shouldShowChangeDetails } from "../utils/activityHelpers";

export function ActivityItem({ activity, itemType = "issue" }: ActivityItemProps) {
  const actionDisplayName = getActionDisplayName(activity.action);
  const actionText = getActionText(activity, itemType);
  const showChangeDetails = shouldShowChangeDetails(activity);
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  // A security entry links to the other side: the request on the issue it was filed for, that issue on the request.
  const securityKey = activity.action.startsWith('SECURITY_') ? activity.details?.forIssueKey ?? activity.details?.requestKey : null;

  return (
    <div className="group flex gap-2.5 py-1.5 hover:bg-collab-950 rounded-md px-1">
      <div className="flex-shrink-0">
        <CustomAvatar user={activity.user} size="xs" />
      </div>

      <div className="flex-1 min-w-0">
        {/* Main activity text */}
        <div className="flex items-center gap-1.5 mb-0.5">
          <ActivityIcon action={activity.action} />
          <span className="text-xs text-collab-400">
            {actionText}
          </span>
          {typeof securityKey === 'string' && (
            <a className="text-xs text-collab-400 underline" href={`${workspaceId ? `/${workspaceId}` : ''}/issues/${securityKey}`}>{securityKey}</a>
          )}
          <span className="text-[10px] text-collab-500">
            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
          </span>
        </div>

        {/* The checked facts of a run's exit note, above the note */}
        {activity.action.startsWith('AGENT_RUN_') && typeof activity.details?.pullRequest === 'string' && (
          <p className="mt-1 text-xs text-collab-400 break-all">Pull request: {activity.details.pullRequest} at <code>{activity.details.headCommit}</code></p>
        )}
        {activity.action.startsWith('AGENT_RUN_') && typeof activity.details?.nextStep === 'string' && (
          <p className="mt-1 text-xs text-collab-400 break-words">Next: {activity.details.nextStep}</p>
        )}
        {/* Change details for field updates */}
        {activity.action.startsWith('AGENT_') && typeof activity.details?.content === 'string' && activity.details.content && (
          <details className="mt-1 text-xs text-collab-400">
            <summary className="cursor-pointer">{activity.action.startsWith('AGENT_RUN_') ? 'Exit note' : 'Handoff details'}</summary>
            <p className="mt-2 whitespace-pre-wrap break-words">{activity.details.content}</p>
            {activity.action === 'AGENT_SUPERSEDED' && typeof activity.details.replacementId === 'string' && <p className="mt-2 break-all">Replacement handoff: <code>{activity.details.replacementId}</code></p>}
          </details>
        )}
        {showChangeDetails && (
          <ActivityChangeDetails activity={activity} />
        )}
      </div>
    </div>
  );
}
