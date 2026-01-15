"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  History,
  ChevronRight,
  RotateCcw,
  Eye,
  GitCompare,
  Clock,
  User,
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

  if (!data?.versioningEnabled && !isLoading) {
    return null;
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn("gap-2", className)}
          >
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
            {currentVersion && currentVersion > 1 && (
              <span className="text-xs text-muted-foreground">
                v{currentVersion}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Version History
            </SheetTitle>
          </SheetHeader>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-destructive">
              Failed to load version history
            </div>
          ) : selectedVersion ? (
            <div className="mt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVersion(null)}
                className="mb-4"
              >
                <ChevronRight className="h-4 w-4 rotate-180 mr-1" />
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
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(selectedVersion.createdAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreVersion(selectedVersion)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Restore
                    </Button>
                  </div>
                  <div className="border rounded-lg p-4 bg-muted/30">
                    <h4 className="font-medium mb-2">{selectedVersion.title}</h4>
                    <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground">
                      {selectedVersion.content}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-120px)] mt-4">
              {compareFromVersion && (
                <div className="mb-4 p-3 bg-accent/50 rounded-lg flex items-center justify-between">
                  <span className="text-sm">
                    Select another version to compare with v{compareFromVersion}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCompareFromVersion(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="space-y-2">
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
                <div className="text-center py-8 text-muted-foreground">
                  No version history available
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
  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isCompareSource && "border-primary bg-primary/5",
        !isCompareSource && "hover:bg-accent/50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <VersionBadge
              version={version.version}
              changeType={version.changeType}
              isLatest={isLatest}
            />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(version.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </span>
          </div>
          <p className="text-sm font-medium mt-1 truncate">{version.title}</p>
          {version.comment && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {version.comment}
            </p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <Avatar className="h-4 w-4">
              <AvatarImage src={version.author.image || undefined} />
              <AvatarFallback className="text-[8px]">
                {version.author.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {version.author.name || version.author.email || "Unknown"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onView}
            title="View version"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCompare}
            title="Compare versions"
          >
            <GitCompare className="h-4 w-4" />
          </Button>
          {!isLatest && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onRestore}
              title="Restore version"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
