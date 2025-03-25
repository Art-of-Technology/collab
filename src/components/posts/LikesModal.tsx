"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type ReactionWithAuthor = {
  id: string;
  type: string;
  authorId: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
};

interface LikesModalProps {
  postId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialLikes?: ReactionWithAuthor[];
}

export default function LikesModal({ postId, isOpen, onOpenChange, initialLikes = [] }: LikesModalProps) {
  const { toast } = useToast();
  const [likesWithAuthor, setLikesWithAuthor] = useState<ReactionWithAuthor[]>(initialLikes);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch likes when the modal opens if not provided
  const fetchLikes = async () => {
    // Don't fetch if we already have data
    if (initialLikes.length > 0) {
      setLikesWithAuthor(initialLikes);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/posts/${postId}/reactions`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch likes");
      }
      
      const data = await response.json();
      // Filter only LIKE reactions and include author details
      const likes = data.reactions.filter((reaction: ReactionWithAuthor) => 
        reaction.type === "LIKE"
      );
      
      setLikesWithAuthor(likes);
    } catch (error) {
      console.error("Failed to get likes:", error);
      toast({
        title: "Error",
        description: "Failed to load likes",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch likes when the modal opens
  useEffect(() => {
    if (isOpen) {
      fetchLikes();
    }
  }, [isOpen, fetchLikes]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] shadow-xl border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle>Likes</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            People who liked this post
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin h-6 w-6 border-2 border-primary rounded-full border-t-transparent"></div>
            </div>
          ) : likesWithAuthor.length > 0 ? (
            <div className="space-y-3">
              {likesWithAuthor.map((reaction) => (
                <div key={reaction.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage 
                      src={reaction.author.image || undefined} 
                      alt={reaction.author.name || "User"} 
                    />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {reaction.author.name?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Link
                      href={`/profile/${reaction.author.id}`}
                      className="font-medium hover:underline"
                    >
                      {reaction.author.name}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">No likes yet</p>
          )}
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 