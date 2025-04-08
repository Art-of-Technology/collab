"use client";

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
import { usePostReactions } from "@/hooks/queries/useReaction";

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
  // Use TanStack Query to fetch reactions
  const { data, isLoading } = usePostReactions(postId);
  
  // Only show likes (filter out other reaction types)
  const likesWithAuthor = data?.reactions
    ? data.reactions.filter((reaction: any) => reaction.type === "LIKE")
    : initialLikes;

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