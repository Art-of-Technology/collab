"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export default function CreatePostForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    message: "",
    type: "UPDATE",
    tags: "",
    priority: "normal",
  });
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.message.trim()) {
      toast({
        title: "Error",
        description: "Message is required",
        variant: "destructive"
      });
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Process tags into an array
      const tagsArray = formData.tags
        ? formData.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [];
      
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: formData.message,
          type: formData.type,
          tags: tagsArray,
          priority: formData.priority,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to create post");
      }
      
      // Reset form
      setFormData({
        message: "",
        type: "UPDATE",
        tags: "",
        priority: "normal",
      });
      
      // Refresh the page to show the new post
      router.refresh();
      
      toast({
        title: "Success",
        description: "Post created successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create post",
        variant: "destructive"
      });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mb-6 overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 border-border/40 bg-card/95">
      <CardHeader className="pb-3 relative">
        <div className="flex space-x-4">
          <Avatar className="h-10 w-10 border border-border/40">
            <AvatarImage src={session?.user?.image || ""} alt={session?.user?.name || "User"} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {session?.user?.name?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium leading-none">{session?.user?.name || "Anonymous"}</p>
            <p className="text-xs text-muted-foreground">@{session?.user?.email?.split('@')[0] || "username"}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <div className="relative">
              <Textarea
                placeholder="What's happening in your development world?"
                className="min-h-24 resize-none bg-background border-border/60 focus:border-primary focus:ring-primary"
                value={formData.message}
                name="message"
                onChange={handleChange}
                ref={textareaRef}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="postType">Post Type</Label>
              <Select 
                value={formData.type}
                onValueChange={(value) => handleSelectChange("type", value)}
              >
                <SelectTrigger className="w-full bg-background border-border/60">
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
                value={formData.priority}
                onValueChange={(value) => handleSelectChange("priority", value)}
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
            />
          </div>
          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={isLoading || !formData.message.trim()} 
              className="bg-primary hover:bg-primary/90 transition-colors"
            >
              {isLoading ? 
                <div className="flex items-center gap-2">
                  <span className="animate-spin">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                  <span>Posting...</span>
                </div>
                : 
                "Post"
              }
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
} 