"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Loader2, UserX, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import type { IssueSelectorProps, IssueUser } from "@/types/issue";

interface IssueReporterSelectorProps extends IssueSelectorProps {
  workspaceId?: string;
}

export function IssueReporterSelector({
  value,
  onChange,
  disabled = false,
  placeholder = "Select reporter...",
  workspaceId
}: IssueReporterSelectorProps) {
  const { data: session } = useSession();
  const [users, setUsers] = useState<IssueUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
        const membersArray: any[] = Array.isArray(data) ? data : (data.members || []);
        const mappedUsers: IssueUser[] = membersArray.map((m: any) => m.user ?? m);
        setUsers(mappedUsers);
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
  const currentUserId = session?.user?.id;

  // Filter users based on search query
  const filteredUsers = users.filter(user =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate current user from others to prioritize current user
  const currentUser = filteredUsers.find(user => user.id === currentUserId);
  const otherUsers = filteredUsers.filter(user => user.id !== currentUserId);
  
  // Combine: current user first, then others in original order
  const prioritizedUsers = currentUser ? [currentUser, ...otherUsers] : otherUsers;

  if (isLoading) {
    return (
      <div className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs h-auto leading-tight min-h-[20px]",
        "border border-[#2d2d30] bg-[#181818]"
      )}>
        <Loader2 className="h-3 w-3 animate-spin text-[#6e7681]" />
        <span className="text-[#6e7681] text-xs">Loading...</span>
      </div>
    );
  }

  return (
    <Popover modal={true}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {selectedUser ? (
            <>
              {selectedUser.useCustomAvatar ? (
                <CustomAvatar user={selectedUser} size="sm" />
              ) : (
                <Avatar className="h-3.5 w-3.5">
                  {selectedUser.image && <AvatarImage src={selectedUser.image} alt={selectedUser.name} />}
                  <AvatarFallback className="text-xs font-medium">
                    {selectedUser.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{selectedUser.name}</span>
            </>
          ) : (
            <>
              <UserX className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Reporter</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-72 p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-3 border-b border-[#2d2d30]">
          <div className="text-xs text-[#9ca3af] mb-2 font-medium">
            Report by
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-[#6e7681]" />
            <Input
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-7 text-xs bg-[#0e0e0e] border-[#2d2d30] focus:border-[#464649] text-[#cccccc]"
            />
          </div>
        </div>
        
        <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-[#444] scrollbar-track-transparent p-1">
          <Button
            type="button"
            variant="ghost"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left h-auto justify-start"
            onClick={() => onChange(undefined as any)}
          >
            <div className="h-5 w-5 rounded-full border-2 border-dashed border-[#555] flex items-center justify-center">
              <UserX className="h-2.5 w-2.5 text-[#6e7681]" />
            </div>
            <span className="text-[#9ca3af] flex-1">No reporter</span>
            {!value && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </Button>

          {prioritizedUsers.length > 0 && (
            <div className="px-2 pt-2 pb-1 text-xs text-[#6e7681]">Team members</div>
          )}

          {prioritizedUsers.map((user) => (
            <Button
              key={user.id}
              type="button"
              variant="ghost"
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left h-auto justify-start",
                user.id === currentUserId
                  ? 'bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30'
                  : 'hover:bg-[#2a2a2a]'
              )}
              onClick={() => onChange(user.id)}
            >
              {user.useCustomAvatar ? (
                <CustomAvatar user={user} size="sm" />
              ) : (
                <Avatar className="h-5 w-5">
                  {user.image && <AvatarImage src={user.image} alt={user.name} />}
                  <AvatarFallback className="text-xs font-medium">
                    {user.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className={cn("text-[#cccccc] flex-1", user.id === currentUserId && 'font-medium')}>
                {user.name}{user.id === currentUserId ? " (You)" : ""}
              </span>
              {value === user.id && (
                <span className="text-xs text-[#6e7681]">✓</span>
              )}
            </Button>
          ))}
          
          {isLoading && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              Loading members...
            </div>
          )}
          
          {!isLoading && prioritizedUsers.length === 0 && users.length > 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              No people match your search
            </div>
          )}
          
          {!isLoading && users.length === 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              No members found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}