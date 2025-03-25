"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

interface PostDialogsProps {
  postId: string;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
  initialEditData: {
    message: string;
    type: string;
    priority: string;
    tags: string;
  };
}

export default function PostDialogs({
  postId,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  isEditDialogOpen,
  setIsEditDialogOpen,
  initialEditData,
}: PostDialogsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editFormData, setEditFormData] = useState(initialEditData);

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleEditSelectChange = (name: string, value: string) => {
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleDeletePost = async () => {
    if (isDeleting) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to delete post");
      }

      setIsDeleteDialogOpen(false);

      toast({
        description: "Post deleted successfully"
      });

      // Refresh the page to remove the deleted post
      router.refresh();

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete post",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!editFormData.message.trim()) {
      toast({
        title: "Error",
        description: "Message is required",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Process tags into an array
      const tagsArray = editFormData.tags
        ? editFormData.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [];

      const response = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: editFormData.message,
          type: editFormData.type,
          tags: tagsArray,
          priority: editFormData.priority,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to update post");
      }

      setIsEditDialogOpen(false);

      toast({
        description: "Post updated successfully"
      });

      // Refresh the page to show the updated post
      router.refresh();

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update post",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="shadow-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Delete Post</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete this post? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
              className="hover-effect"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeletePost}
              disabled={isDeleting}
              className="hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Post Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] shadow-xl border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Make changes to your post. Click save when you&apos;re done.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea
                  id="message"
                  name="message"
                  value={editFormData.message}
                  onChange={handleEditChange}
                  placeholder="What's happening in your development world?"
                  rows={4}
                  className="resize-none bg-background border-border/60 focus:border-primary focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type">Post Type</Label>
                  <Select
                    name="type"
                    value={editFormData.type}
                    onValueChange={(value) => handleEditSelectChange("type", value)}
                  >
                    <SelectTrigger className="bg-background border-border/60">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UPDATE">Update</SelectItem>
                      <SelectItem value="BLOCKER">Blocker</SelectItem>
                      <SelectItem value="IDEA">Idea</SelectItem>
                      <SelectItem value="QUESTION">Question</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select
                    name="priority"
                    value={editFormData.priority}
                    onValueChange={(value) => handleEditSelectChange("priority", value)}
                  >
                    <SelectTrigger className="bg-background border-border/60">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input
                  id="tags"
                  name="tags"
                  value={editFormData.tags}
                  onChange={handleEditChange}
                  placeholder="e.g. react, bug, feature"
                  className="bg-background border-border/60 focus:border-primary focus:ring-primary"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                disabled={isSubmitting}
                className="hover-effect"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !editFormData.message.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
} 