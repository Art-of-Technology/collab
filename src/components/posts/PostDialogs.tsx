"use client";

import React, { useState, useEffect } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useDeletePost, useUpdatePost } from "@/hooks/queries/usePost";
import { CollabInput } from "../ui/collab-input";

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
  const [editFormData, setEditFormData] = useState(initialEditData);
  const [isImproving, setIsImproving] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  
  // Use TanStack Query mutations
  const deletePostMutation = useDeletePost();
  const updatePostMutation = useUpdatePost(postId);
  
  // Derive loading states from mutations
  const isDeleting = deletePostMutation.isPending;
  const isSubmitting = updatePostMutation.isPending;

  // Reset form data when dialog opens
  useEffect(() => {
    if (isEditDialogOpen) {
      const newFormData = {
        message: initialEditData.message || '',
        type: initialEditData.type || 'UPDATE',
        priority: initialEditData.priority || 'normal',
        tags: initialEditData.tags || ''
      };
      setEditFormData(newFormData);
      
      // Small delay to ensure CollabInput is mounted and ready
      setTimeout(() => {
        setEditFormData(prev => ({ ...prev }));
      }, 100);
      
      // Force remount by changing key
      setInputKey(prev => prev + 1);
    }
  }, [isEditDialogOpen, initialEditData]);

  // Track editFormData changes
  useEffect(() => {
    // This effect is for debugging - can be removed in production
  }, [editFormData]);

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

  const handleMessageChange = (value: string) => {
    setEditFormData(prev => ({
      ...prev,
      message: value
    }));
  };

  // AI Improve Handler
  const handleAiImprove = async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) {
      return text;
    }
    
    setIsImproving(true);
    toast({
      title: "Improving text...",
      description: "Please wait while AI improves your text"
    });
    
    try {
      const response = await fetch("/api/ai/shorten", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        throw new Error("Failed to improve text");
      }
      
      const data = await response.json();
      
      // Auto-update type if AI suggests a category change
      if (data.category) {
        handleEditSelectChange("type", data.category.toUpperCase());
      }

      // Extract message from the response
      const improvedText = data.message || data.improvedText || text;
      
      // Return the improved text to be displayed in the popup
      return improvedText;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to improve text. Please try again.",
        variant: "destructive"
      });
      console.error(error);
      // Return original text if there was an error
      return text;
    } finally {
      setIsImproving(false);
    }
  };

  const handleDeletePost = async () => {
    try {
      await deletePostMutation.mutateAsync(postId);
      
      setIsDeleteDialogOpen(false);
      
      toast({
        description: "Post deleted successfully"
      });
      
      // Router navigation is handled by the mutation
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete post",
        variant: "destructive"
      });
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editFormData.message.trim()) {
      toast({
        title: "Error",
        description: "Message is required",
        variant: "destructive"
      });
      return;
    }

    try {
      // Process tags into an array
      const tagsArray = editFormData.tags
        ? editFormData.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [];

      await updatePostMutation.mutateAsync({
        message: editFormData.message,
        type: editFormData.type as any,
        tags: tagsArray,
        priority: editFormData.priority as any,
      });

      setIsEditDialogOpen(false);

      toast({
        description: "Post updated successfully"
      });
      
      // Refresh the page to show updated post
      router.refresh();
      
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update post",
        variant: "destructive"
      });
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
                <CollabInput
                  key={`edit-post-${postId}-${inputKey}`}
                  value={editFormData.message}
                  onChange={handleMessageChange}
                  placeholder="What's on your mind?"
                  minHeight="120px"
                  maxHeight="200px"
                  maxLength={160}
                  onAiImprove={handleAiImprove}
                  loading={isSubmitting || isImproving}
                  disabled={isSubmitting || isImproving}
                  showAiButton={true}
                  showSubmitButton={false}
                  className="bg-background border-border/60 focus:border-primary focus:ring-primary"
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
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
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
                disabled={isSubmitting || isImproving}
                className="hover-effect"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isImproving || !editFormData.message.trim()}
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