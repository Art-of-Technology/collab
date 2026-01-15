"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  History,
  ChevronLeft,
  RotateCcw,
  Eye,
  GitCompare,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VersionBadge } from "@/components/notes/VersionBadge";
import { VersionDiff } from "@/components/notes/VersionDiff";
import { RestoreVersionDialog } from "@/components/notes/RestoreVersionDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { NoteVersionChangeType } from "@prisma/client";

interface VersionAuthor {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

interface NoteVersion {
  id: string;
  version: number;
  title: string;
  content: string;
  authorId: string;
  comment: string | null;
  changeType: NoteVersionChangeType;
  contentHash: string | null;
  createdAt: string;
  author: VersionAuthor;
}

interface VersionHistoryResponse {
  versions: NoteVersion[];
  total: number;
  hasMore: boolean;
  currentVersion: number;
  versioningEnabled: boolean;
}

interface VersionHistoryPanelProps {
  noteId: string;
  currentVersion?: number;
  onRestore?: (version: number) => void;
  className?: string;
}

// Utility function to process content for preview
const getContentPreview = (content: string, maxLength: number = 100) => {
  const processedContent = content
    .replace(/<p[^>]*>/gi, "")
    .replace(/<\/p>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const truncated = processedContent.length > maxLength;
  const preview = processedContent.substring(0, maxLength);

  return { preview: preview + (truncated ? "..." : ""), truncated };
};

// Get color for version change type
const getChangeTypeColor = (changeType: NoteVersionChangeType) => {
  switch (changeType) {
    case "CREATED": return "#22c55e";
    case "UPDATED": return "#3b82f6";
    case "RESTORED": return "#f59e0b";
    case "PUBLISHED": return "#a855f7";
    default: return "#6366f1";
  }
};

async function fetchVersionHistory(noteId: string): Promise<VersionHistoryResponse> {
  const response = await fetch(`/api/notes/${noteId}/versions`);
  if (!response.ok) {
    throw new Error("Failed to fetch version history");
  }
  return response.json();
}

export function VersionHistoryPanel({
  noteId,
  currentVersion,
  onRestore,
  className,
}: VersionHistoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<NoteVersion | null>(null);
  const [compareFromVersion, setCompareFromVersion] = useState<number | null>(null);
  const [restoreVersion, setRestoreVersion] = useState<NoteVersion | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["noteVersions", noteId],
    queryFn: () => fetchVersionHistory(noteId),
    enabled: isOpen,
  });

  const handleViewVersion = (version: NoteVersion) => {
    setSelectedVersion(version);
    setCompareFromVersion(null);
  };

  const handleCompareVersion = (version: NoteVersion) => {
    if (compareFromVersion === null) {
      setCompareFromVersion(version.version);
    } else {
      setSelectedVersion(version);
    }
  };

  const handleRestoreComplete = () => {
    setRestoreVersion(null);
    refetch();
    if (onRestore && restoreVersion) {
      onRestore(restoreVersion.version);
    }
  };

  // Only hide if we've explicitly fetched data and versioning is disabled
  // Don't hide before the query runs (data is undefined initially)
  if (data && !data.versioningEnabled) {
    return null;
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-1.5", className)}
          >
            <History className="h-3 w-3" />
            <span>History</span>
            {currentVersion && currentVersion > 1 && (
              <span className="text-[10px] text-[#6e7681]">
                v{currentVersion}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-2xl bg-[#0a0a0b] border-[#1f1f1f]">
          <SheetHeader className="border-b border-[#1f1f1f] pb-4">
            <SheetTitle className="flex items-center gap-2 text-[#e6edf3]">
              <div className="w-8 h-8 rounded-lg bg-[#1a1a1b] flex items-center justify-center">
                <History className="h-4 w-4 text-[#3b82f6]" />
              </div>
              <div>
                <span className="text-sm font-medium">Version History</span>
                {data && (
                  <p className="text-xs text-[#6e7681] font-normal">
                    {data.versions.length} version{data.versions.length !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[#6e7681]" />
                <p className="text-xs text-[#52525b]">Loading versions...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-red-400">Failed to load version history</p>
            </div>
          ) : selectedVersion ? (
            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVersion(null)}
                className="mb-4 text-[#6e7681] hover:text-[#e6edf3]"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Back to list
              </Button>
              {compareFromVersion ? (
                <VersionDiff
                  noteId={noteId}
                  fromVersion={compareFromVersion}
                  toVersion={selectedVersion.version}
                  onClose={() => {
                    setSelectedVersion(null);
                    setCompareFromVersion(null);
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <VersionBadge
                        version={selectedVersion.version}
                        changeType={selectedVersion.changeType}
                      />
                      <span className="text-xs text-[#6e7681]">
                        {formatDistanceToNow(new Date(selectedVersion.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreVersion(selectedVersion)}
                      className="h-7"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Restore
                    </Button>
                  </div>
                  <div className="rounded-lg border border-[#1f1f1f] bg-[#0d0d0e] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#1f1f1f]">
                      <h4 className="text-sm font-semibold text-[#fafafa]">{selectedVersion.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Avatar className="h-4 w-4">
                          <AvatarImage src={selectedVersion.author.image || undefined} />
                          <AvatarFallback className="text-[8px] bg-[#27272a] text-[#71717a]">
                            {selectedVersion.author.name?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-[10px] text-[#52525b]">
                          {selectedVersion.author.name || selectedVersion.author.email || "Unknown"}
                        </span>
                        <span className="text-[10px] text-[#3f3f46]">
                          {format(new Date(selectedVersion.createdAt), "MMM d, yyyy 'at' h:mm a")}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <div
                        className="prose prose-sm prose-invert max-w-none text-[#e4e4e7]
                          [&_p]:my-2 [&_p]:text-[#e4e4e7]
                          [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-[#fafafa] [&_h1]:mt-4 [&_h1]:mb-2
                          [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-[#fafafa] [&_h2]:mt-3 [&_h2]:mb-2
                          [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-[#e4e4e7] [&_h3]:mt-3 [&_h3]:mb-1
                          [&_ul]:my-2 [&_ol]:my-2 [&_li]:text-[#d4d4d8]
                          [&_code]:bg-[#27272a] [&_code]:text-[#f472b6] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs
                          [&_pre]:bg-[#18181b] [&_pre]:border [&_pre]:border-[#27272a] [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-3
                          [&_blockquote]:border-l-2 [&_blockquote]:border-[#3f3f46] [&_blockquote]:pl-3 [&_blockquote]:text-[#a1a1aa] [&_blockquote]:italic
                          [&_a]:text-blue-400 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: selectedVersion.content }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-140px)] mt-4">
              {compareFromVersion && (
                <div className="mb-4 p-3 rounded-lg bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-between">
                  <span className="text-xs text-[#3b82f6]">
                    Select another version to compare with v{compareFromVersion}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setCompareFromVersion(null)}
                    className="h-6 w-6 text-[#3b82f6] hover:text-[#60a5fa]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              <div className="rounded-lg border border-[#1f1f1f] overflow-hidden divide-y divide-[#1f1f1f]">
                {data?.versions.map((version, index) => (
                  <VersionListItem
                    key={version.id}
                    version={version}
                    isLatest={index === 0}
                    isCompareSource={compareFromVersion === version.version}
                    onView={() => handleViewVersion(version)}
                    onCompare={() => handleCompareVersion(version)}
                    onRestore={() => setRestoreVersion(version)}
                  />
                ))}
              </div>
              {data?.versions.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 rounded-lg border border-dashed border-[#27272a] bg-[#0d0d0e]/50">
                  <History className="h-10 w-10 text-[#3f3f46] mb-4" />
                  <h3 className="text-sm font-medium text-[#a1a1aa] mb-1">
                    No version history
                  </h3>
                  <p className="text-xs text-[#52525b]">
                    Changes will be tracked automatically
                  </p>
                </div>
              )}
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      <RestoreVersionDialog
        open={!!restoreVersion}
        onOpenChange={(open) => !open && setRestoreVersion(null)}
        noteId={noteId}
        version={restoreVersion}
        onRestore={handleRestoreComplete}
      />
    </>
  );
}

interface VersionListItemProps {
  version: NoteVersion;
  isLatest: boolean;
  isCompareSource: boolean;
  onView: () => void;
  onCompare: () => void;
  onRestore: () => void;
}

function VersionListItem({
  version,
  isLatest,
  isCompareSource,
  onView,
  onCompare,
  onRestore,
}: VersionListItemProps) {
  const { preview } = getContentPreview(version.content, 80);
  const changeTypeColor = getChangeTypeColor(version.changeType);

  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 px-5 py-3.5 hover:bg-gradient-to-r hover:from-[#151518] hover:to-transparent transition-all duration-200 cursor-pointer",
        isCompareSource && "bg-[#3b82f6]/5 border-l-2 border-l-[#3b82f6]"
      )}
      onClick={onView}
    >
      {/* Color indicator based on change type */}
      <div
        className="w-1 h-10 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: changeTypeColor }}
      />

      {/* Version Info */}
      <div className="flex-1 min-w-0">
        {/* Title Row */}
        <div className="flex items-center gap-2.5">
          <h3 className="text-[14px] font-semibold text-[#fafafa] group-hover:text-white truncate">
            {version.title}
          </h3>
          <VersionBadge
            version={version.version}
            changeType={version.changeType}
            isLatest={isLatest}
          />
        </div>

        {/* Content Preview */}
        {preview && (
          <p className="text-[12px] text-[#52525b] truncate max-w-[400px] mt-0.5">
            {preview}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-3 mt-1.5">
          {/* Author avatar */}
          <div className="flex items-center gap-1.5">
            <Avatar className="h-4 w-4">
              <AvatarImage src={version.author.image || undefined} />
              <AvatarFallback className="text-[8px] bg-[#27272a] text-[#71717a]">
                {version.author.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] text-[#52525b]">
              {version.author.name || version.author.email || "Unknown"}
            </span>
          </div>

          <span className="text-[10px] text-[#3f3f46]">
            {formatDistanceToNow(new Date(version.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      {/* Inline Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="h-8 w-8 text-[#52525b] hover:text-[#e6edf3]"
          title="View version"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.stopPropagation();
            onCompare();
          }}
          className={cn(
            "h-8 w-8",
            isCompareSource
              ? "text-[#3b82f6]"
              : "text-[#52525b] hover:text-[#e6edf3]"
          )}
          title="Compare versions"
        >
          <GitCompare className="h-3.5 w-3.5" />
        </Button>
        {!isLatest && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => {
              e.stopPropagation();
              onRestore();
            }}
            className="h-8 w-8 text-[#52525b] hover:text-amber-400"
            title="Restore version"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
