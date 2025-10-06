"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { UserX, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { cn } from "@/lib/utils";

interface AssigneeSelectorProps {
  value: string[];
  onChange: (assignees: string[]) => void;
  disabled?: boolean;
  assignees?: Array<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
    useCustomAvatar?: boolean;
  }>;
}

export function AssigneeSelector({
  value = [],
  onChange,
  disabled = false,
  assignees = [],
}: AssigneeSelectorProps) {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedAssignees = assignees.filter(a => value.includes(a.id));
  const currentUserId = session?.user?.id;
  
  // Filter assignees based on search query
  const filteredAssignees = assignees.filter(assignee =>
    assignee.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    assignee.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate current user from others to prioritize current user
  const currentUser = filteredAssignees.find(assignee => assignee.id === currentUserId);
  const otherAssignees = filteredAssignees.filter(assignee => assignee.id !== currentUserId);
  
  // Combine: current user first, then others in original order
  const prioritizedAssignees = currentUser ? [currentUser, ...otherAssignees] : otherAssignees;

  const toggleAssignee = (assigneeId: string) => {
    const newValues = value.includes(assigneeId)
      ? value.filter(v => v !== assigneeId)
      : [...value, assigneeId];
    onChange(newValues);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <Popover modal={true} open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors h-auto leading-tight min-h-[20px]",
            "border border-[#2d2d30] hover:border-[#464649] hover:bg-[#1a1a1a]",
            "text-[#cccccc] focus:outline-none bg-[#181818]",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {selectedAssignees.length === 0 ? (
            <>
              <UserX className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Assignee</span>
            </>
          ) : selectedAssignees.length === 1 ? (
            <>
              {selectedAssignees[0].useCustomAvatar ? (
                <CustomAvatar user={selectedAssignees[0]} size="sm" />
              ) : (
                <Avatar className="h-3.5 w-3.5">
                  {selectedAssignees[0].image && <AvatarImage src={selectedAssignees[0].image} alt={selectedAssignees[0].name} />}
                  <AvatarFallback className="text-xs font-medium">
                    {selectedAssignees[0].name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{selectedAssignees[0].name}</span>
            </>
          ) : (
            <>
              <div className="flex items-center -space-x-1">
                {selectedAssignees.slice(0, 3).map((assignee, index) => (
                  <div key={assignee.id} className="relative" style={{ zIndex: 3 - index }}>
                    {assignee.useCustomAvatar ? (
                      <CustomAvatar user={assignee} size="sm" className="border border-[#181818]" />
                    ) : (
                      <Avatar className="h-3.5 w-3.5 border border-[#181818]">
                        {assignee.image && <AvatarImage src={assignee.image} alt={assignee.name} />}
                        <AvatarFallback className="text-xs font-medium bg-[#2a2a2a] text-white">
                          {assignee.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                {selectedAssignees.length > 3 && (
                  <div className="h-3.5 w-3.5 rounded-full bg-[#404040] border border-[#181818] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{selectedAssignees.length} assignees</span>
            </>
          )}
        </button>
      </PopoverTrigger>
      
      <PopoverContent 
        className="w-72 p-0 bg-[#1c1c1e] border-[#2d2d30] shadow-xl"
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <div className="p-3 border-b border-[#2d2d30]">
          <div className="text-xs text-[#9ca3af] mb-2 font-medium">
            Filter by assignees
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
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-[#2a2a2a] transition-colors text-left"
            onClick={() => onChange([])}
          >
            <div className="h-5 w-5 rounded-full border-2 border-dashed border-[#555] flex items-center justify-center">
              <UserX className="h-2.5 w-2.5 text-[#6e7681]" />
            </div>
            <span className="text-[#9ca3af] flex-1">Clear assignee filter</span>
            {value.length === 0 && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </button>
          
          {prioritizedAssignees.length > 0 && (
            <div className="px-2 pt-2 pb-1 text-xs text-[#6e7681]">Team members</div>
          )}
          
          {prioritizedAssignees.map((assignee) => (
            <button
              key={assignee.id}
              type="button"
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left ${
                assignee.id === currentUserId 
                  ? 'bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30' 
                  : 'hover:bg-[#2a2a2a]'
              }`}
              onClick={() => toggleAssignee(assignee.id)}
            >
              {assignee.useCustomAvatar ? (
                <CustomAvatar user={assignee} size="sm" />
              ) : (
                <Avatar className="h-5 w-5">
                  {assignee.image && <AvatarImage src={assignee.image} alt={assignee.name} />}
                  <AvatarFallback className="text-xs font-medium">
                    {assignee.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className={`text-[#cccccc] flex-1 ${assignee.id === currentUserId ? 'font-medium' : ''}`}>
                {assignee.name}{assignee.id === currentUserId ? " (You)" : ""}
              </span>
              {value.includes(assignee.id) && (
                <span className="text-xs text-[#6e7681]">✓</span>
              )}
            </button>
          ))}
          
          {prioritizedAssignees.length === 0 && assignees.length > 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              No people match your search
            </div>
          )}
          
          {assignees.length === 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              No members found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
