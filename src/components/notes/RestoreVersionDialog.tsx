"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VersionBadge } from "@/components/notes/VersionBadge";
import { NoteVersionChangeType } from "@prisma/client";
import { toast } from "sonner";

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

interface RestoreVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string;
  version: NoteVersion | null;
  onRestore?: () => void;
}

async function restoreVersion(
  noteId: string,
  versionNumber: number,
  comment?: string
): Promise<{ message: string; newVersion: number }> {
  const response = await fetch(`/api/notes/${noteId}/versions/${versionNumber}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to restore version");
  }

  return response.json();
}

export function RestoreVersionDialog({
  open,
  onOpenChange,
  noteId,
  version,
  onRestore,
}: RestoreVersionDialogProps) {
  const [comment, setComment] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => {
      if (!version) throw new Error("No version selected");
      return restoreVersion(noteId, version.version, comment || undefined);
    },
    onSuccess: (data) => {
      toast.success(`Note restored to version ${version?.version}`);
      queryClient.invalidateQueries({ queryKey: ["noteVersions", noteId] });
      queryClient.invalidateQueries({ queryKey: ["note", noteId] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      setComment("");
      onOpenChange(false);
      onRestore?.();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (!version) {
    return null;
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Restore Version
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <div className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>
                This will create a new version with the content from version{" "}
                <span className="font-medium">{version.version}</span>.
              </span>
            </div>

            <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
              <div className="flex items-center gap-2">
                <VersionBadge
                  version={version.version}
                  changeType={version.changeType}
                />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {version.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  Created on{" "}
                  {format(new Date(version.createdAt), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
              {version.comment && (
                <p className="text-xs text-muted-foreground italic">
                  "{version.comment}"
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="restore-comment" className="text-foreground">
                Comment (optional)
              </Label>
              <Input
                id="restore-comment"
                placeholder="Reason for restoring this version..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore Version
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
