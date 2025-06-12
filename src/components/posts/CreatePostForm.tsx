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
      handleSelectChange("type", data.category.toUpperCase() || "UPDATE");

      // Extract message from the response
      const improvedText = data.message || data.improvedText || text;
      
      // Ensure options are open if AI suggests a type change
      if (data.category && !optionsOpen) {
        setOptionsOpen(true);
      }
      
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
      const createdPost = await createPostMutation.mutateAsync({
        message: formData.message,
        type: formData.type as 'UPDATE' | 'BLOCKER' | 'IDEA' | 'QUESTION',
        tags: tagsArray,
        priority: formData.priority as 'normal' | 'high' | 'critical',
        workspaceId: currentWorkspace.id,
      });

      // Process mentions if the post was created successfully
      if (createdPost?.id) {
        await processMentions(createdPost.id, formData.message);
      }

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
    <Card className="mb-6 shadow-lg hover:shadow-xl transition-shadow duration-300 border-border/40 bg-card/95">
      <CardHeader className="pb-3 relative">
        <div className="flex space-x-4">
          {renderAvatar()}
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium leading-none">{session?.user?.name || "Anonymous"}</p>
            <p className="text-xs text-muted-foreground">@{session?.user?.email?.split('@')[0] || "username"}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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