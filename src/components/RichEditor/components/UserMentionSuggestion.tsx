"use client";

import React, { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { User } from "../types";
import { cn } from "@/lib/utils";

interface UserMentionSuggestionProps {
  query: string;
  onSelect: (user: User) => void;
  onEscape?: () => void;
  workspaceId?: string;
}

export function UserMentionSuggestion({ query, onSelect, onEscape, workspaceId }: UserMentionSuggestionProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch users when query changes
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query || "" });
        if (workspaceId) {
          params.append("workspace", workspaceId);
        }

        const response = await fetch(`/api/users/search?${params}`);
        if (response.ok) {
          const searchedUsers = await response.json();
          setUsers(searchedUsers);
          setSelectedIndex(-1);
          setIsKeyboardNavigation(false);
        } else {
          console.error("Failed to search users");
          setUsers([]);
        }
      } catch (error) {
        console.error("Error searching users:", error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [query, workspaceId]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!users.length) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => (prev + 1) % users.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setIsKeyboardNavigation(true);
          setSelectedIndex((prev) => (prev <= 0 ? users.length - 1 : prev - 1));
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < users.length) {
            const selectedUser = users[selectedIndex];
            if (selectedUser && selectedUser.id) {
              onSelect(selectedUser);
            }
          }
          break;
        case "Escape":
          e.preventDefault();
          onEscape?.();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [users, selectedIndex, onSelect, onEscape]);

  // Scroll selected item into view
  useEffect(() => {
    if (isKeyboardNavigation && selectedIndex >= 0 && containerRef.current) {
      const selectedElement = containerRef.current.children[selectedIndex] as HTMLElement;
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isKeyboardNavigation]);

  const getInitials = (name: string | null): string => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  if (loading) {
    return (
      <div className="bg-popover border rounded-md shadow-md p-2 min-w-[200px]">
        <div className="text-sm text-muted-foreground">Searching users...</div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="bg-popover border rounded-md shadow-md p-2 min-w-[200px]">
        <div className="text-sm text-muted-foreground">No users found</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-popover border rounded-md shadow-md p-1 min-w-[200px] max-h-[200px] overflow-y-auto">
      {users.map((user, index) => (
        <Button
          key={user.id}
          variant="ghost"
          className={cn(
            "w-full justify-start h-auto gap-2 p-1 hover:bg-[#1f1f1f] hover:text-accent-foreground",
            selectedIndex === index ? "bg-[#1f1f1f] text-accent-foreground" : ""
          )}
          onClick={() => {
            if (user && user.id) {
              onSelect(user);
            }
          }}
          onMouseEnter={() => {
            if (!isKeyboardNavigation) {
              setSelectedIndex(index);
            }
          }}
          onMouseLeave={() => {
            if (!isKeyboardNavigation) {
              setSelectedIndex(-1);
            }
          }}
        >
          <Avatar className="h-6 w-6">
            <AvatarImage src={user.image || ""} alt={user.name || ""} />
            <AvatarFallback className="text-xs">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs truncate">{user.name || user.email}</div>
            {user.name && <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>}
          </div>
        </Button>
      ))}
    </div>
  );
}
