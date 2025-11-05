"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "next-auth/react";
import { Label } from "@/components/ui/label";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useCreatePost } from "@/hooks/queries/usePost";
import { useCurrentUser } from "@/hooks/queries/useUser";
import { CollabInput } from "@/components/ui/collab-input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractMentions, extractMentionUserIds } from "@/utils/mentions";
import axios from "axios";

export default function CreatePostForm() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const { currentWorkspace } = useWorkspace();
  const [isImproving, setIsImproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Use TanStack Query hooks
  const { data: currentUser } = useCurrentUser();
  const createPostMutation = useCreatePost();

  const [formData, setFormData] = useState({
    message: "",
    type: "UPDATE",
    tags: "",
    priority: "normal",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleMessageChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      message: value
    }));
  };

  const handleAiImprove = async (text: string): Promise<any> => {
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

      // Check if the API response is ok before parsing JSON
      if (!response.ok) {
        let errorMessage = "Failed to process request";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not valid JSON (e.g., HTML error page), use default error message
          errorMessage = `Request failed with status ${response.status}`;
        }
        return {
          invalid_content: true,
          error: errorMessage,
          message: "",
          category: ""
        };
      }

      const data = await response.json();

      // Check if the content is invalid
      if (data.invalid_content) {
        return {
          invalid_content: true,
          error: "Please enter meaningful text that can be improved and classified.",
          message: "",
          category: ""
        };
      }

      // Check if the message or category is missing (undefined/null)
      // This distinguishes between missing fields and intentionally empty strings
      if (data.message === undefined || data.category === undefined || data.message === null || data.category === null) {
        return {
          invalid_content: true,
          error: "No improvements suggested",
          message: "",
          category: ""
        };
      }

      // Update the category if the AI suggests a type change
      handleSelectChange("type", data.category.toUpperCase() || "UPDATE");

      // Ensure options are open if AI suggests a type change
      if (data.category && !optionsOpen) {
        setOptionsOpen(true);
      }

      // Return the full response object
      return {
        message: data.message,
        category: data.category,
        invalid_content: false
      };

    } catch (error) {
      console.error(error);
      return {
        invalid_content: true,
        error: "Failed to improve text. Please try again.",
        message: "",
        category: ""
      };
    } finally {
      setIsImproving(false);
    }
  };

  // Function to process mentions in the post text
  const processMentions = async (postId: string, message: string) => {
    // Extract user IDs directly from the message if using new format
    const mentionedUserIds = extractMentionUserIds(message);

    // Also extract usernames for backward compatibility (old format)
    const mentionedUsernames = extractMentions(message);

    // If neither format found, return early
    if (mentionedUserIds.length === 0 && mentionedUsernames.length === 0) return;

    try {
      let userIds = [...mentionedUserIds]; // Start with directly extracted IDs

      // If we have usernames that need to be looked up
      if (mentionedUsernames.length > 0) {
        // Query users by usernames to get their IDs
        const response = await axios.post("/api/users/lookup", {
          usernames: mentionedUsernames,
          workspaceId: currentWorkspace?.id
        });

        const mentionedUsers = response.data;

        if (mentionedUsers && mentionedUsers.length > 0) {
          // Add the looked-up user IDs
          const lookupUserIds = mentionedUsers.map((user: any) => user.id);
          userIds = [...userIds, ...lookupUserIds];

          // Remove duplicates
          userIds = [...new Set(userIds)];
        }
      }

      // Create notifications for mentioned users (if any found)
      if (userIds.length > 0) {
        await axios.post("/api/mentions", {
          userIds,
          sourceType: "post",
          sourceId: postId,
          content: `mentioned you in a post: "${message.length > 100 ? message.substring(0, 97) + '...' : message}"`
        });
      }
    } catch (error) {
      console.error("Failed to process mentions:", error);
      // Don't fail the post creation if mentions fail
    }
  };

  const handleSubmit = async () => {
    if (!formData.message.trim()) {
      toast({
        title: "Error",
        description: "Message is required",
        variant: "destructive"
      });
      return;
    }

    if (formData.message.length > 160) {
      toast({
        title: "Error",
        description: "Message is too long. Max 160 characters",
        variant: "destructive"
      });
      return;
    }

    if (!currentWorkspace) {
      toast({
        title: "Error",
        description: "No workspace selected",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Process tags into an array
      const tagsArray = formData.tags
        ? formData.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [];

      // Use TanStack Query mutation
      await createPostMutation.mutateAsync({
        message: formData.message,
        type: formData.type as 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION',
        tags: tagsArray,
        priority: formData.priority as 'normal' | 'high' | 'critical',
        workspaceId: currentWorkspace.id,
      });

      // Reset form
      setFormData({
        message: "",
        type: "UPDATE",
        tags: "",
        priority: "normal",
      });
      setOptionsOpen(false); // Close options on successful submit

      toast({
        title: "Success",
        description: "Post created successfully"
      });

    } catch (error) {
      console.error("Failed to create post:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create post",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderAvatar = () => {
    if (!currentUser) return null;

    return currentUser.useCustomAvatar ? (
      <CustomAvatar user={currentUser} size="sm" />
    ) : (
      <Avatar className="h-8 w-8">
        <AvatarImage src={session?.user?.image || undefined} alt={session?.user?.name || "User"} />
        <AvatarFallback className="bg-primary/10 text-primary">
          {session?.user?.name?.charAt(0).toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
    );
  };

  return (
    <Card className="mb-6 shadow-lg hover:shadow-xl transition-all duration-300 bg-[#0e0e0e] border-[#1a1a1a] hover:border-[#333]">
      <CardHeader className="pb-3 relative border-b border-[#1a1a1a]">
        <div className="flex space-x-4">
          {renderAvatar()}
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium leading-none text-[#e6edf3]">{session?.user?.name || "Anonymous"}</p>
            <p className="text-xs text-[#8b949e]">@{session?.user?.email?.split('@')[0] || "username"}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen} className="space-y-0">
          <div className="space-y-2 mb-1">
            <CollabInput
              value={formData.message}
              onChange={handleMessageChange}
              onSubmit={handleSubmit}
              placeholder="What are you up to today?"
              minHeight="100px"
              maxHeight="200px"
              maxLength={160}
              onAiImprove={handleAiImprove}
              loading={isSubmitting || isImproving}
              disabled={isSubmitting || isImproving}
              showAiButton={true}
              showSubmitButton={true}
            />
          </div>

          {/* Centered Chevron Trigger */}
          <div className="flex justify-center items-center h-4">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 rounded-md transition-transform duration-300 data-[state=open]:rotate-180",
                  "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent
            className={cn(
              "space-y-4 pt-3 overflow-hidden transition-all duration-300",
              "data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
            )}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postType">Post Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => handleSelectChange("type", value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full bg-background border-border/60">
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
                  value={formData.priority}
                  onValueChange={(value) => handleSelectChange("priority", value)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full bg-background border-border/60">
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
                placeholder="e.g. react, typescript, nextjs"
                className="bg-background border-border/60 focus:border-primary focus:ring-primary"
                value={formData.tags}
                onChange={handleChange}
                disabled={isSubmitting}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
} 