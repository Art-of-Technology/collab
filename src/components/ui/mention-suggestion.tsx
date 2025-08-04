"use client";

import { forwardRef, useEffect, useState, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { CommandEmpty, CommandGroup, CommandItem, CommandList, Command } from "@/components/ui/command";
import { useMention } from '@/context/MentionContext';
import { CheckIcon, User2Icon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface User {
  id: string;
  name: string | null;
  image: string | null;
  useCustomAvatar?: boolean;
  avatarAccessory?: number | null;
  avatarBrows?: number | null; 
  avatarEyes?: number | null;
  avatarEyewear?: number | null;
  avatarHair?: number | null;
  avatarMouth?: number | null;
  avatarNose?: number | null;
  avatarSkinTone?: number | null;
}

interface MentionSuggestionProps {
  query: string;
  onSelect: (user: User) => void;
  workspaceId?: string;
  onEscape?: () => void;
}

export const MentionSuggestion = forwardRef<HTMLDivElement, MentionSuggestionProps>(
  ({ query, onSelect, workspaceId, onEscape }, ref) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { searchUsers } = useMention();
    const commandRef = useRef<HTMLDivElement>(null);

    // Function to get initials for avatar fallback
    const getInitials = (name: string | null): string => {
      if (!name) return "U";
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    };

    // Handle keyboard navigation
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!users.length) return;

        // Arrow keys for navigation
        if (e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev < users.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === "Enter" && users[selectedIndex]) {
          e.preventDefault();
          e.stopPropagation();

          onSelect(users[selectedIndex]);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onEscape?.();
        }
      };

      // Add event listener to document instead of window, with higher priority
      document.addEventListener("keydown", handleKeyDown, true); // Use capture phase
      return () => {
        document.removeEventListener("keydown", handleKeyDown, true);
      };
    }, [users, users.length, selectedIndex, onSelect, onEscape]);

    // Search users when query changes
    useEffect(() => {
      const fetchUsers = async () => {
        setLoading(true);
        try {
          // Fetch users with the query (empty query will return all workspace users)
          const searchedUsers = await searchUsers(query, workspaceId);
          setUsers(searchedUsers);
          // Reset selected index when new results come in
          setSelectedIndex(0);
        } catch (error) {
          console.error('Error searching users:', error);
          setUsers([]);
        } finally {
          setLoading(false);
        }
      };
      
      fetchUsers();
    }, [query, searchUsers, workspaceId]);

    // Scroll selected item into view
    useEffect(() => {
      if (commandRef.current && users.length > 0) {
        const selectedElement = commandRef.current.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedElement) {
          selectedElement.scrollIntoView({ block: 'nearest' });
        }
      }
    }, [selectedIndex, users.length]);

    return (
      <div ref={ref} className="z-50 overflow-hidden rounded-lg border shadow-lg animate-in fade-in-0 zoom-in-95 bg-popover">
        <Command ref={commandRef} className="w-[280px]">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Mention a user
          </div>
          <CommandList className="max-h-[200px] overflow-y-auto">
            {loading ? (
              <div className="py-6 text-center flex items-center justify-center space-x-2">
                <div className="animate-spin h-3 w-3 rounded-full border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <div className="py-6 text-center">
                    <User2Icon className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground mt-2">No users found</p>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {users.map((user, index) => (
                    <CommandItem
                      key={user.id}
                      data-index={index}
                      onSelect={() => onSelect(user)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-2 cursor-pointer",
                        selectedIndex === index && "bg-accent"
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {user.useCustomAvatar ? (
                          <CustomAvatar user={user} size="sm" />
                        ) : (
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <span className="text-sm font-medium">{user.name}</span>
                      </div>
                      {selectedIndex === index && (
                        <CheckIcon className="h-4 w-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          {users.length > 0 && (
            <div className="px-2 py-1.5 text-xs border-t flex justify-between">
              <span className="text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded border">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-muted rounded border ml-1">↓</kbd> to navigate
              </span>
              <span className="text-muted-foreground">
                <kbd className="px-1.5 py-0.5 bg-muted rounded border">enter</kbd> to select
              </span>
            </div>
          )}
        </Command>
      </div>
    );
  }
);

MentionSuggestion.displayName = "MentionSuggestion"; 