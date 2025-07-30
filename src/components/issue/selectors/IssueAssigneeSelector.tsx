"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import type { IssueSelectorProps, IssueUser } from "@/types/issue";

interface IssueAssigneeSelectorProps extends IssueSelectorProps {
  workspaceId?: string;
}

export function IssueAssigneeSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Assign to...",
  workspaceId
}: IssueAssigneeSelectorProps) {
  const [users, setUsers] = useState<IssueUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const fetchUsers = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/members`);
        if (!response.ok) {
          throw new Error("Failed to fetch workspace members");
        }
        const data = await response.json();
        setUsers(data.members || []);
      } catch (error) {
        console.error("Error fetching workspace members:", error);
        setUsers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [workspaceId]);

  const selectedUser = users.find(user => user.id === value);

  // User display component
  const UserDisplay = ({ user, showUnassigned = false }: { user?: IssueUser; showUnassigned?: boolean }) => {
    if (showUnassigned || !user) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
            <UserX className="h-3 w-3" />
          </div>
          <span className="text-sm">Unassigned</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {user.useCustomAvatar ? (
          <CustomAvatar user={user} size="sm" />
        ) : (
          <Avatar className="h-6 w-6">
            <AvatarImage src={user.image || ""} alt={user.name} />
            <AvatarFallback className="text-xs font-medium">
              {user.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
        )}
        <span className="text-sm font-medium">{user.name}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center justify-center h-10 px-3",
        "border border-border/50 rounded-md bg-muted/30"
      )}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Select
      value={value || "unassigned"}
      onValueChange={(newValue) => onChange(newValue === "unassigned" ? undefined : newValue)}
      disabled={disabled}
    >
      <SelectTrigger className={cn(
        "w-full border-border/50 bg-background/50",
        "hover:border-border/80 hover:bg-background/80",
        "focus:border-primary/50 focus:bg-background",
        "transition-all duration-200"
      )}>
        <SelectValue placeholder={placeholder}>
          <UserDisplay user={selectedUser} showUnassigned={!selectedUser} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-[200px]">
        <SelectItem value="unassigned" className="py-2.5">
          <UserDisplay showUnassigned={true} />
        </SelectItem>
        {users.map((user) => (
          <SelectItem
            key={user.id}
            value={user.id}
            className="py-2.5"
          >
            <UserDisplay user={user} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
} 