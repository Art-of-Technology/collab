"use client";

import { useState, useEffect } from "react";
import { Pin, FileText, Loader2, ChevronRight, Lock, Users, FolderKanban, Globe, Share2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoteType, NoteScope } from "@prisma/client";
import { NOTE_TYPE_CONFIGS } from "@/lib/note-types";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface PinnedNote {
  id: string;
  title: string;
  type: NoteType;
  scope: NoteScope;
  isPinned: boolean;
  pinnedAt: string;
  isAiContext?: boolean;
  author: {
    id: string;
    name: string | null;
    image: string | null;
  };
  pinnedByUser: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  project: {
    id: string;
    name: string;
    slug: string;
    color?: string;
  } | null;
  updatedAt: string;
}

// Note scope icons mapping
const noteScopeIcons: Record<NoteScope, any> = {
  PERSONAL: Lock,
  SHARED: Share2,
  PROJECT: FolderKanban,
  WORKSPACE: Users,
  PUBLIC: Globe,
};

// Get scope color for indicator
const getScopeColor = (scope: NoteScope) => {
  switch (scope) {
    case NoteScope.PERSONAL: return '#71717a';
    case NoteScope.PROJECT: return '#a855f7';
    case NoteScope.WORKSPACE: return '#22c55e';
    case NoteScope.PUBLIC: return '#f59e0b';
    case NoteScope.SHARED: return '#3b82f6';
    default: return '#6366f1';
  }
};

interface PinnedNotesSectionProps {
  workspaceId: string;
  workspaceSlug: string;
  projectId?: string;
  className?: string;
}

export function PinnedNotesSection({
  workspaceId,
  workspaceSlug,
  projectId,
  className
}: PinnedNotesSectionProps) {
  const [pinnedNotes, setPinnedNotes] = useState<PinnedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const fetchPinnedNotes = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          workspaceId,
          limit: "6"
        });

        if (projectId) {
          params.set("projectId", projectId);
        }

        const response = await fetch(`/api/notes/pinned?${params}`);
        if (response.ok) {
          const data = await response.json();
          setPinnedNotes(data);
        }
      } catch (error) {
        console.error("Error fetching pinned notes:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPinnedNotes();
  }, [workspaceId, projectId]);

  // Don't render if no pinned notes
  if (!isLoading && pinnedNotes.length === 0) {
    return null;
  }

  return (
    <div className={cn("", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs font-medium text-[#6e7681] hover:text-[#8b949e] mb-2 w-full h-7 px-0 justify-start"
      >
        <Pin className="h-3.5 w-3.5 text-amber-500" />
        <span>Pinned</span>
        <span className="text-[10px] bg-[#1f1f23] px-1.5 py-0.5 rounded text-[#71717a]">
          {pinnedNotes.length}
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 ml-auto transition-transform",
            isExpanded && "rotate-90"
          )}
        />
      </Button>

      {isExpanded && (
        <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[#6e7681]" />
            </div>
          ) : (
            pinnedNotes.map((note) => {
              const typeConfig = NOTE_TYPE_CONFIGS[note.type];
              const TypeIcon = typeConfig?.icon || FileText;
              const ScopeIcon = noteScopeIcons[note.scope] || Lock;

              return (
                <Link
                  key={note.id}
                  href={`/${workspaceSlug}/notes/${note.id}`}
                  className="group relative flex items-center gap-4 px-5 py-3.5 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200"
                >
                  {/* Color indicator based on scope */}
                  <div
                    className="w-1 h-10 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ backgroundColor: getScopeColor(note.scope) }}
                  />

                  {/* Note Info */}
                  <div className="flex-1 min-w-0">
                    {/* Title Row */}
                    <div className="flex items-center gap-2.5">
                      <TypeIcon className={cn("h-3.5 w-3.5 flex-shrink-0", typeConfig?.color)} />
                      <h3 className="text-[14px] font-semibold text-[#fafafa] group-hover:text-white truncate">
                        {note.title}
                      </h3>
                      <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />
                      {note.isAiContext && (
                        <Bot className="h-3 w-3 text-purple-400 flex-shrink-0" />
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1f1f23] text-[#71717a] font-medium flex-shrink-0 flex items-center gap-1">
                        <ScopeIcon className="h-2.5 w-2.5" />
                        {note.scope.charAt(0) + note.scope.slice(1).toLowerCase()}
                      </span>
                    </div>

                    {/* Stats Row */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {/* Author avatar */}
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={note.author.image || undefined} />
                          <AvatarFallback className="text-[8px] bg-[#27272a] text-[#71717a]">
                            {note.author.name?.charAt(0)?.toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] text-[#52525b]">{note.author.name}</span>
                      </div>

                      {note.project && (
                        <div className="flex items-center gap-1 text-[11px] text-[#71717a]">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: note.project.color || "#6366f1" }}
                          />
                          <span>{note.project.name}</span>
                        </div>
                      )}

                      <span className="text-[10px] text-[#3f3f46]">
                        {formatDistanceToNow(new Date(note.updatedAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
