"use client";

import { formatDistanceToNow } from "date-fns";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { ActivityItemProps } from "../types/activity";
import { ActivityIcon } from "./ActivityIcon";
import { ActivityChangeDetails } from "./ActivityChangeDetails";
import { getActionDisplayName, getActionText, shouldShowChangeDetails } from "../utils/activityHelpers";

export function ActivityItem({ activity, itemType = "issue" }: ActivityItemProps) {
  const actionDisplayName = getActionDisplayName(activity.action);
  const actionText = getActionText(activity, itemType);
  const showChangeDetails = shouldShowChangeDetails(activity);

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
          <span className="text-[10px] text-collab-500">
            {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
          </span>
        </div>

        {/* Change details for field updates */}
        {showChangeDetails && (
          <ActivityChangeDetails activity={activity} />
        )}
      </div>
    </div>
  );
}
