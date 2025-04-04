import React, { useState, useEffect } from "react";
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

interface User {
  id: string;
  name: string | null;
  image?: string | null;
  useCustomAvatar?: boolean;
  avatarAccessory?: number;
  avatarBrows?: number;
  avatarEyes?: number;
  avatarEyewear?: number;
  avatarHair?: number;
  avatarMouth?: number;
  avatarNose?: number;
  avatarSkinTone?: number;
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
  const { currentWorkspace } = useWorkspace();
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch workspace members for assignee selection
  useEffect(() => {
    const fetchMembers = async () => {
      const wsId = workspaceId || currentWorkspace?.id;
      if (!wsId) return;
      
      setLoading(true);
      try {
        const response = await fetch(`/api/workspaces/${wsId}/members`);
        
        if (response.ok) {
          const data = await response.json();
          // Create a map to deduplicate members by ID
          const uniqueUsers = new Map();
          data.forEach((member: any) => {
            if (member.user) {
              // Ensure all avatar properties are included
              uniqueUsers.set(member.user.id, {
                id: member.user.id,
                name: member.user.name,
                image: member.user.image,
                useCustomAvatar: member.user.useCustomAvatar || false,
                avatarAccessory: member.user.avatarAccessory || 0,
                avatarBrows: member.user.avatarBrows || 1,
                avatarEyes: member.user.avatarEyes || 1,
                avatarEyewear: member.user.avatarEyewear || 0,
                avatarHair: member.user.avatarHair || 1,
                avatarMouth: member.user.avatarMouth || 1,
                avatarNose: member.user.avatarNose || 1,
                avatarSkinTone: member.user.avatarSkinTone || 1
              });
            }
          });
          setUsers(Array.from(uniqueUsers.values()));
        }
      } catch (error) {
        console.error("Error fetching members:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [currentWorkspace, workspaceId]);

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

  if (isLoading || loading) {
    return (
      <div className="flex items-center h-10 px-3 text-sm border rounded-md">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        Loading...
      </div>
    );
  }

  // Filter the users based on the search
  const filteredUsers = users.filter(user => 
    !searchQuery || (user.name?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // The key to fixing the scroll issue is removing animation and using Command's native scrolling
  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`flex justify-between w-full ${className}`}
          disabled={disabled}
        >
          {selectedUser ? (
            <div className="flex items-center gap-2">
              {renderAvatar(selectedUser)}
              <span>{selectedUser.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {renderAvatar(user)}
                    <span>{user.name}</span>
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