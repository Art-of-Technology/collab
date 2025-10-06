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

interface ReporterSelectorProps {
  value: string[];
  onChange: (reporters: string[]) => void;
  disabled?: boolean;
  reporters?: Array<{
    id: string;
    name: string;
    email: string;
    image?: string | null;
    useCustomAvatar?: boolean;
  }>;
}

export function ReporterSelector({
  value = [],
  onChange,
  disabled = false,
  reporters = [],
}: ReporterSelectorProps) {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedReporters = reporters.filter(r => value.includes(r.id));
  const currentUserId = session?.user?.id;
  
  // Filter reporters based on search query
  const filteredReporters = reporters.filter(reporter =>
    reporter.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    reporter.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate current user from others to prioritize current user
  const currentUser = filteredReporters.find(reporter => reporter.id === currentUserId);
  const otherReporters = filteredReporters.filter(reporter => reporter.id !== currentUserId);
  
  // Combine: current user first, then others in original order
  const prioritizedReporters = currentUser ? [currentUser, ...otherReporters] : otherReporters;

  const toggleReporter = (reporterId: string) => {
    const newValues = value.includes(reporterId)
      ? value.filter(v => v !== reporterId)
      : [...value, reporterId];
    onChange(newValues);
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
          {selectedReporters.length === 0 ? (
            <>
              <UserX className="h-3 w-3 text-[#6e7681]" />
              <span className="text-[#6e7681] text-xs">Reporter</span>
            </>
          ) : selectedReporters.length === 1 ? (
            <>
              {selectedReporters[0].useCustomAvatar ? (
                <CustomAvatar user={selectedReporters[0]} size="sm" />
              ) : (
                <Avatar className="h-3.5 w-3.5">
                  {selectedReporters[0].image && <AvatarImage src={selectedReporters[0].image} alt={selectedReporters[0].name || "User Avatar"} />}
                  <AvatarFallback className="text-xs font-medium">
                    {selectedReporters[0].name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className="text-[#cccccc] text-xs truncate max-w-[80px]">{selectedReporters[0].name}</span>
            </>
          ) : (
            <>
              <div className="flex items-center -space-x-1">
                {selectedReporters.slice(0, 3).map((reporter, index) => (
                  <div key={reporter.id} className="relative" style={{ zIndex: 3 - index }}>
                    {reporter.useCustomAvatar ? (
                      <CustomAvatar user={reporter} size="sm" className="border border-[#181818]" />
                    ) : (
                      <Avatar className="h-3.5 w-3.5 border border-[#181818]">
                        {reporter.image && <AvatarImage src={reporter.image} alt={reporter.name} />}
                        <AvatarFallback className="text-xs font-medium bg-[#2a2a2a] text-white">
                          {reporter.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                ))}
                {selectedReporters.length > 3 && (
                  <div className="h-3.5 w-3.5 rounded-full bg-[#404040] border border-[#181818] flex items-center justify-center">
                    <span className="text-[8px] text-white font-medium">+</span>
                  </div>
                )}
              </div>
              <span className="text-[#cccccc] text-xs">{selectedReporters.length} reporters</span>
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
            Filter by reporters
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
            <span className="text-[#9ca3af] flex-1">Clear reporter filter</span>
            {value.length === 0 && (
              <span className="text-xs text-[#6e7681]">✓</span>
            )}
          </button>
          
          {prioritizedReporters.length > 0 && (
            <div className="px-2 pt-2 pb-1 text-xs text-[#6e7681]">Team members</div>
          )}
          
          {prioritizedReporters.map((reporter) => (
            <button
              key={reporter.id}
              type="button"
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left ${
                reporter.id === currentUserId 
                  ? 'bg-blue-50 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/30' 
                  : 'hover:bg-[#2a2a2a]'
              }`}
              onClick={() => toggleReporter(reporter.id)}
            >
              {reporter.useCustomAvatar ? (
                <CustomAvatar user={reporter} size="sm" />
              ) : (
                <Avatar className="h-5 w-5">
                  {reporter.image && <AvatarImage src={reporter.image} alt={reporter.name || "User Avatar"} />}
                  <AvatarFallback className="text-xs font-medium">
                    {reporter.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <span className={`text-[#cccccc] flex-1 ${reporter.id === currentUserId ? 'font-medium' : ''}`}>
                {reporter.name}{reporter.id === currentUserId ? " (You)" : ""}
              </span>
              {value.includes(reporter.id) && (
                <span className="text-xs text-[#6e7681]">✓</span>
              )}
            </button>
          ))}
          
          {prioritizedReporters.length === 0 && reporters.length > 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              No people match your search
            </div>
          )}
          
          {reporters.length === 0 && (
            <div className="px-2 py-4 text-center text-[#6e7681] text-xs">
              No members found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
