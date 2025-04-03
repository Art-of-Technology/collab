"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const commentSchema = z.object({
  content: z.string().min(1, "Comment cannot be empty"),
});

type CommentFormValues = z.infer<typeof commentSchema>;

interface TaskCommentFormProps {
  taskId: string;
  onCommentAdded?: () => void;
  userImage?: string | null;
  currentUserId?: string;
}

export function TaskCommentForm({ taskId, onCommentAdded, userImage, currentUserId }: TaskCommentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentHtml, setCommentHtml] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const { toast } = useToast();
  
  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      content: "",
    },
  });
  
  const handleEditorChange = (markdown: string, html: string) => {
    setCommentText(markdown);
    setCommentHtml(html);
    form.setValue("content", markdown);
  };

  const handleAiImprove = async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;
    
    setIsImproving(true);
    
    try {
      const response = await fetch("/api/ai/improve", {
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
      
      // Extract message from the response
      const improvedText = data.message || data.improvedText || text;
      
      // Return improved text
      return improvedText;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({
        title: "Error",
        description: "Failed to improve text",
        variant: "destructive"
      });
      return text;
    } finally {
      setIsImproving(false);
    }
  };
  
  const onSubmit = async (values: CommentFormValues) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: values.content,
          html: commentHtml
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to add comment");
      }
      
      // Reset form
      form.reset();
      setCommentText("");
      setCommentHtml("");
      
      // Show success message
      toast({
        description: "Comment added",
      });
      
      // Call the callback to refresh comments instead of reloading the page
      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (error) {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 w-full">
        <div className="flex gap-2 items-start border-t pt-3 border-border/30 relative z-10">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={userImage || undefined} alt="User" />
            <AvatarFallback>
              {currentUserId ? currentUserId.charAt(0).toUpperCase() : "U"}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <FormField
              control={form.control}
              name="content"
              render={() => (
                <FormItem className="min-h-[100px]">
                  <FormControl>
                    <MarkdownEditor
                      onChange={handleEditorChange}
                      placeholder="Add a comment..."
                      minHeight="80px"
                      maxHeight="250px"
                      compact={true}
                      className="mb-2 bg-background rounded-md"
                      content={commentText}
                      onAiImprove={handleAiImprove}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end">
              <Button 
                type="submit" 
                size="sm"
                variant="ghost"
                disabled={!commentText.trim() || isSubmitting || isImproving}
                className="text-primary hover:text-primary/90"
              >
                {isSubmitting ? "Posting..." : "Post"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
} 