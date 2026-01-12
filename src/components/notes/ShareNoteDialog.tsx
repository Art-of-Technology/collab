"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { NoteSharePermission } from "@prisma/client";
import { getNoteSharePermissionOptions } from "@/lib/note-types";
import { Share2, Loader2, X, UserPlus, Eye, Edit } from "lucide-react";
import { cn } from "@/lib/utils";

interface NoteShareUser {
  id: string;
  userId: string;
  permission: NoteSharePermission;
  sharedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
}

interface ShareNoteDialogProps {
  noteId: string;
  noteTitle: string;
  isOwner: boolean;
  onShareUpdated?: () => void;
  trigger?: React.ReactNode;
}

export function ShareNoteDialog({
  noteId,
  noteTitle,
  isOwner,
  onShareUpdated,
  trigger,
}: ShareNoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<NoteShareUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<NoteSharePermission>(
    NoteSharePermission.READ
  );
  const { toast } = useToast();

  const permissionOptions = getNoteSharePermissionOptions();

  const fetchShares = async () => {
    if (!noteId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/share`);
      if (!response.ok) throw new Error("Failed to fetch shares");
      const data = await response.json();
      setShares(data);
    } catch (error) {
      console.error("Error fetching shares:", error);
      toast({
        title: "Error",
        description: "Failed to load share settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchShares();
    }
  }, [open, noteId]);

  const handleShare = async () => {
    if (!email.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permission }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to share note");
      }

      const newShare = await response.json();
      setShares((prev) => {
        // Update existing or add new
        const existing = prev.findIndex((s) => s.userId === newShare.userId);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = newShare;
          return updated;
        }
        return [newShare, ...prev];
      });

      setEmail("");
      toast({
        title: "Shared",
        description: `Note shared with ${newShare.user.email || newShare.user.name}`,
      });

      onShareUpdated?.();
    } catch (error: any) {
      console.error("Error sharing note:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to share note",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePermission = async (
    shareId: string,
    newPermission: NoteSharePermission
  ) => {
    const share = shares.find((s) => s.id === shareId);
    if (!share) return;

    try {
      const response = await fetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: share.userId,
          permission: newPermission,
        }),
      });

      if (!response.ok) throw new Error("Failed to update permission");

      setShares((prev) =>
        prev.map((s) =>
          s.id === shareId ? { ...s, permission: newPermission } : s
        )
      );

      toast({
        title: "Updated",
        description: "Permission updated successfully",
      });

      onShareUpdated?.();
    } catch (error) {
      console.error("Error updating permission:", error);
      toast({
        title: "Error",
        description: "Failed to update permission",
        variant: "destructive",
      });
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    try {
      const response = await fetch(
        `/api/notes/${noteId}/share?shareId=${shareId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) throw new Error("Failed to remove share");

      setShares((prev) => prev.filter((s) => s.id !== shareId));

      toast({
        title: "Removed",
        description: "Share removed successfully",
      });

      onShareUpdated?.();
    } catch (error) {
      console.error("Error removing share:", error);
      toast({
        title: "Error",
        description: "Failed to remove share",
        variant: "destructive",
      });
    }
  };

  if (!isOwner) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share Note</DialogTitle>
          <DialogDescription>
            Share &quot;{noteTitle}&quot; with specific people
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add new share */}
          <div className="space-y-2">
            <Label>Invite people</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleShare();
                  }
                }}
                className="flex-1"
              />
              <Select
                value={permission}
                onValueChange={(val) =>
                  setPermission(val as NoteSharePermission)
                }
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {permissionOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        {opt.value === NoteSharePermission.READ ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <Edit className="h-3 w-3" />
                        )}
                        {opt.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleShare} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Current shares */}
          <div className="space-y-2">
            <Label>People with access</Label>
            <div className="border rounded-lg divide-y">
              {isLoading ? (
                <div className="p-4 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : shares.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Not shared with anyone yet
                </div>
              ) : (
                shares.map((share) => (
                  <div
                    key={share.id}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={share.user.image || undefined} />
                        <AvatarFallback>
                          {share.user.name?.[0] ||
                            share.user.email?.[0] ||
                            "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {share.user.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {share.user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={share.permission}
                        onValueChange={(val) =>
                          handleUpdatePermission(
                            share.id,
                            val as NoteSharePermission
                          )
                        }
                      >
                        <SelectTrigger className="w-[100px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {permissionOptions.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                              className="text-xs"
                            >
                              <div className="flex items-center gap-2">
                                {opt.value === NoteSharePermission.READ ? (
                                  <Eye className="h-3 w-3" />
                                ) : (
                                  <Edit className="h-3 w-3" />
                                )}
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveShare(share.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
