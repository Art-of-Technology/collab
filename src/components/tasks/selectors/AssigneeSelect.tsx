import React, { useState } from "react";
import { useSession } from "next-auth/react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Loader2, ChevronDown } from "lucide-react";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useWorkspaceMembers } from "@/hooks/queries/useWorkspace";

interface User {
  id: string;
  name: string | null;
  image?: string | null;
  useCustomAvatar?: boolean;
  avatarAccessory?: number | null;
  avatarBrows?: number | null;
  avatarEyes?: number | null;
  avatarEyewear?: number | null;
  avatarHair?: number | null;
  avatarMouth?: number | null;
  avatarNose?: number | null;
  avatarSkinTone?: number | null;
  role?: string;
}

interface AssigneeSelectProps {
  value?: string | null;
  onChange: (userId: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  workspaceId?: string;
}

export function AssigneeSelect({
  value,
  onChange,
  isLoading = false,
  disabled = false,
  placeholder = "Unassigned",
  className = "",
  workspaceId
}: AssigneeSelectProps) {
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspace();
  const wsId = workspaceId || currentWorkspace?.id;
  
  // Use TanStack Query for fetching workspace members
  const { data, isLoading: membersLoading } = useWorkspaceMembers(wsId);
  
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Process users from the server response
  const users = data?.members
    ? data.members.map(member => member.user)
    : [];
    
  // Add the workspace owner to the list if they exist
  if (data?.workspace?.owner && !users.some(user => user.id === data.workspace.owner.id)) {
    users.push(data.workspace.owner);
  }

  // Get current user ID from session
  const currentUserId = session?.user?.id;

  // Find the selected user
  const selectedUser = value && value !== "unassigned" 
    ? users.find(u => u.id === value) 
    : null;

  const handleSelect = (userId: string) => {
    onChange(userId);
    setOpen(false);
    setSearchQuery("");
  };

  // Get user initials for avatar fallback (matching Navbar.tsx)
  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Helper to render avatar consistently
  const renderAvatar = (user: User) => {
    if (user.useCustomAvatar) {
      return <CustomAvatar user={user} size="sm" />;
    }

    return (
      <Avatar className="h-7 w-7">
        {user.image ? (
          <AvatarImage src={user.image} alt={user.name || "User"} />
        ) : (
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        )}
      </Avatar>
    );
  };

  if (isLoading || membersLoading) {
    return (
      <div className="flex items-center h-10 px-3 text-sm border rounded-md">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading...
      </div>
    );
  }

  // Filter and prioritize users based on the search
  const filteredUsers = users
    .filter(user => 
      !searchQuery || (user.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      // Prioritize current user first
      if (currentUserId) {
        if (a.id === currentUserId && b.id !== currentUserId) return -1;
        if (b.id === currentUserId && a.id !== currentUserId) return 1;
      }
      
      // Then sort alphabetically by name
      const nameA = a.name?.toLowerCase() || '';
      const nameB = b.name?.toLowerCase() || '';
      return nameA.localeCompare(nameB);
    });

  // The key to fixing the scroll issue is removing animation and using Command's native scrolling
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`flex justify-between w-full min-w-0 px-2 ${className}`}
          disabled={disabled}
        >
          {selectedUser ? (
            <div className="flex items-center gap-2 min-w-0">
              {renderAvatar(selectedUser)}
              <span className="truncate">{selectedUser.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* 
        This is the key fix:
        1. Remove default animation with className override
        2. Add data-state="open" to ensure no animation conflicts
        3. Remove border/rounded from PopoverContent and let Command handle it
      */}
      <PopoverContent 
        className="w-[300px] p-0 border-none bg-transparent shadow-none" 
        align="start" 
        sideOffset={4}
        forceMount
        
      >
        <Command className="rounded-md border shadow-md">
          <CommandInput 
            placeholder="Search assignee..." 
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="h-9"
          />
          <CommandList className="max-h-[300px] overflow-y-auto">
            <CommandEmpty>No user found.</CommandEmpty>
            <CommandGroup heading="Assignee">
              <CommandItem
                key="unassigned"
                value="unassigned"
                onSelect={() => handleSelect("unassigned")}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  <span>Unassigned</span>
                </div>
              </CommandItem>
              {filteredUsers.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.name || ""}
                  onSelect={() => handleSelect(user.id)}
                  className={`cursor-pointer ${user.id === currentUserId ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {renderAvatar(user)}
                    <span className={user.id === currentUserId ? 'font-medium' : ''}>
                      {user.name}{user.id === currentUserId ? " (You)" : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
} 