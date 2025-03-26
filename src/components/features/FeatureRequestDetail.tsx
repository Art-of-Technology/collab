"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowUpIcon,
  ArrowDownIcon,
  Hourglass,
  CheckCircle,
  XCircle,
  ThumbsUp,
  MoreVertical,
  AlertTriangle
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { MarkdownContent } from "@/components/ui/markdown-content";

type Author = {
  id: string;
  name: string | null;
  image: string | null;
};

interface FeatureRequestDetailProps {
  featureRequest: {
    id: string;
    title: string;
    description: string;
    html?: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    voteScore: number;
    upvotes: number;
    downvotes: number;
    authorId: string;
    author: Author;
    _count?: {
      votes?: number;
      comments?: number;
    };
  };
  userVote: number | null;
  isAdmin: boolean;
  currentUserId: string | undefined;
}

export default function FeatureRequestDetail({
  featureRequest,
  userVote,
  isAdmin,
  currentUserId,
}: FeatureRequestDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isVoting, setIsVoting] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(featureRequest.status);
  const [voteScore, setVoteScore] = useState(featureRequest.voteScore);
  const [upvotes, setUpvotes] = useState(featureRequest.upvotes);
  const [downvotes, setDownvotes] = useState(featureRequest.downvotes);
  const [currentUserVote, setCurrentUserVote] = useState(userVote);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  
  const isAuthor = currentUserId === featureRequest.author.id;

  const handleVote = async (value: number) => {
    if (!currentUserId) {
      toast({
        title: "Authentication required",
        description: "You must be logged in to vote",
        variant: "destructive",
      });
      return;
    }

    if (isVoting) return;
    
    setIsVoting(true);
    try {
      // If clicking the same vote again, we're removing the vote
      const effectiveValue = currentUserVote === value ? 0 : value;
      
      const response = await fetch(`/api/features/${featureRequest.id}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: effectiveValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to vote");
      }

      const data = await response.json();
      setVoteScore(data.voteScore);
      setUpvotes(data.upvotes);
      setDownvotes(data.downvotes);
      setCurrentUserVote(data.vote?.value || null);
      
      // Give feedback on vote
      if (effectiveValue === 0) {
        toast({
          title: "Vote removed",
          description: "Your vote has been removed",
        });
      } else {
        toast({
          title: "Vote recorded",
          description: `You ${effectiveValue > 0 ? 'upvoted' : 'downvoted'} this feature request`,
        });
      }
      
    } catch (error) {
      console.error("Vote error:", error);
      toast({
        title: "Error",
        description: "Failed to vote on this feature request",
        variant: "destructive",
      });
    } finally {
      setIsVoting(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (isUpdatingStatus) return;
    setStatusError(null);
    
    setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/api/features/${featureRequest.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("Status update error:", errorData);
        throw new Error(errorData?.error || "Failed to update status");
      }

      setCurrentStatus(status);
      
      toast({
        title: "Status updated",
        description: `Feature request is now marked as ${status}`,
      });
      
      router.refresh();
    } catch (error) {
      console.error("Status update error:", error);
      setStatusError((error as Error).message || "Failed to update the status");
      
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to update the status",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const deleteFeatureRequest = async () => {
    if (isDeleting) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/features/${featureRequest.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      toast({
        title: "Success",
        description: "Feature request has been deleted",
      });
      
      router.push("/features");
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete this feature request",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper function to get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 transition-colors">
            <Hourglass className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 transition-colors">
            <CheckCircle className="h-3 w-3 mr-1" />
            Accepted
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="secondary" className="bg-red-500/10 text-red-600 transition-colors">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 transition-colors">
            <ThumbsUp className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border-border/40 bg-card/95 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-2xl font-bold">{featureRequest.title}</CardTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Submitted {formatDistanceToNow(new Date(featureRequest.createdAt), { addSuffix: true })}
            </span>
            {getStatusBadge(currentStatus)}
          </div>
        </div>
        
        {(isAdmin || isAuthor) && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-secondary/80 transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isAdmin && (
                  <>
                    <DropdownMenuItem 
                      onClick={() => updateStatus("pending")}
                      disabled={isUpdatingStatus || currentStatus === "pending"}
                      className="hover:text-yellow-600 cursor-pointer"
                    >
                      <Hourglass className="mr-2 h-4 w-4 text-yellow-500" />
                      <span>Mark as Pending</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => updateStatus("accepted")}
                      disabled={isUpdatingStatus || currentStatus === "accepted"}
                      className="hover:text-green-600 cursor-pointer"
                    >
                      <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                      <span>Accept</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => updateStatus("rejected")}
                      disabled={isUpdatingStatus || currentStatus === "rejected"}
                      className="hover:text-red-600 cursor-pointer"
                    >
                      <XCircle className="mr-2 h-4 w-4 text-red-500" />
                      <span>Reject</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => updateStatus("completed")}
                      disabled={isUpdatingStatus || currentStatus === "completed"}
                      className="hover:text-blue-600 cursor-pointer"
                    >
                      <ThumbsUp className="mr-2 h-4 w-4 text-blue-500" />
                      <span>Mark as Completed</span>
                    </DropdownMenuItem>
                    
                    {isAuthor && <DropdownMenuSeparator />}
                  </>
                )}
                
                {isAuthor && (
                  <DropdownMenuItem 
                    onClick={() => setIsDeleteDialogOpen(true)}
                    disabled={isDeleting}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                  >
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete Request"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </CardHeader>
      
      {statusError && (
        <div className="mx-6 mt-2 p-2 bg-red-100 border border-red-200 text-red-800 text-sm rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            <span>Error updating status: {statusError}</span>
          </div>
          <div className="mt-1 text-xs">
            Please check your permissions or try again later.
          </div>
        </div>
      )}
      
      <CardContent className="pt-4 pb-6">
        <div className="flex gap-6">
          {/* Vote controls */}
          <div className="flex flex-col items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleVote(1)}
              disabled={isVoting || !currentUserId}
              className={`rounded-full hover:bg-green-100 transition-all ${currentUserVote === 1 ? 'bg-green-100 text-green-600 shadow-sm' : ''}`}
            >
              <ArrowUpIcon className="h-5 w-5" />
            </Button>
            
            <span className={`font-bold text-lg transition-colors ${voteScore > 0 ? 'text-green-600' : voteScore < 0 ? 'text-red-600' : ''}`}>
              {voteScore}
            </span>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleVote(-1)}
              disabled={isVoting || !currentUserId}
              className={`rounded-full hover:bg-red-100 transition-all ${currentUserVote === -1 ? 'bg-red-100 text-red-600 shadow-sm' : ''}`}
            >
              <ArrowDownIcon className="h-5 w-5" />
            </Button>
            
            <div className="text-xs text-muted-foreground mt-1">
              <div className="flex flex-col items-center">
                <span>{upvotes} up</span>
                <span>{downvotes} down</span>
              </div>
            </div>
          </div>
          
          {/* Feature request content */}
          <div className="flex-1 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Avatar className="h-8 w-8 border border-border/40">
                  <AvatarImage src={featureRequest.author.image || undefined} alt={featureRequest.author.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {featureRequest.author.name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{featureRequest.author.name}</span>
              </div>
              
              <h3 className="text-lg font-medium">Description</h3>
              {featureRequest.html ? (
                <MarkdownContent 
                  content={featureRequest.html} 
                  className="mt-2"
                />
              ) : (
                <p className="mt-2 whitespace-pre-line">{featureRequest.description}</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="bg-card/95 backdrop-blur-sm border-border/40">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your feature request and all associated votes and comments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border/40 hover:bg-secondary/80 transition-colors">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={deleteFeatureRequest} 
              className="bg-red-500 hover:bg-red-600 transition-colors"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
} 