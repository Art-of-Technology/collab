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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
    status: string;
    createdAt: string;
    author: Author;
    voteScore: number;
    upvotes: number;
    downvotes: number;
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
  
  const isAuthor = currentUserId === featureRequest.author.id;

  const handleVote = async (value: number) => {
    if (!currentUserId) {
      toast({
        title: "Error",
        description: "You must be logged in to vote",
        variant: "destructive",
      });
      return;
    }

    if (isVoting) return;
    
    setIsVoting(true);
    try {
      const response = await fetch(`/api/features/${featureRequest.id}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value }),
      });

      if (!response.ok) {
        throw new Error("Failed to vote");
      }

      const data = await response.json();
      setVoteScore(data.voteScore);
      setUpvotes(data.upvotes);
      setDownvotes(data.downvotes);
      setCurrentUserVote(data.vote?.value || null);
      
    } catch (error) {
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
        throw new Error("Failed to update status");
      }

      setCurrentStatus(status);
      
      toast({
        title: "Status updated",
        description: `Feature request is now ${status}`,
      });
      
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update the status",
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
        title: "Deleted",
        description: "Feature request has been deleted",
      });
      
      router.push("/features");
      router.refresh();
    } catch (error) {
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
          <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200">
            <Hourglass className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
            <CheckCircle className="h-3 w-3 mr-1" />
            Accepted
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
            <ThumbsUp className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden bg-card/95 backdrop-blur-sm border-border/50 hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-2xl">{featureRequest.title}</CardTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Submitted {formatDistanceToNow(new Date(featureRequest.createdAt), { addSuffix: true })}
            </span>
            {getStatusBadge(currentStatus)}
          </div>
        </div>
        
        {(isAdmin || isAuthor) && (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isUpdatingStatus}>
                    {isUpdatingStatus ? "Updating..." : "Update Status"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => updateStatus("pending")}>
                    <Hourglass className="mr-2 h-4 w-4 text-yellow-500" />
                    <span>Mark as Pending</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateStatus("accepted")}>
                    <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                    <span>Accept</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateStatus("rejected")}>
                    <XCircle className="mr-2 h-4 w-4 text-red-500" />
                    <span>Reject</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateStatus("completed")}>
                    <ThumbsUp className="mr-2 h-4 w-4 text-blue-500" />
                    <span>Mark as Completed</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {isAuthor && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => setIsDeleteDialogOpen(true)}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="flex gap-6">
          {/* Vote controls */}
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleVote(1)}
              disabled={isVoting || !currentUserId}
              className={`rounded-full ${currentUserVote === 1 ? 'bg-green-100 text-green-600' : ''}`}
            >
              <ArrowUpIcon className="h-5 w-5" />
            </Button>
            
            <span className={`font-bold text-lg ${voteScore > 0 ? 'text-green-600' : voteScore < 0 ? 'text-red-600' : ''}`}>
              {voteScore}
            </span>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleVote(-1)}
              disabled={isVoting || !currentUserId}
              className={`rounded-full ${currentUserVote === -1 ? 'bg-red-100 text-red-600' : ''}`}
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
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={featureRequest.author.image || undefined} alt={featureRequest.author.name || "User"} />
                <AvatarFallback>
                  {featureRequest.author.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{featureRequest.author.name}</span>
            </div>
            
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <p className="whitespace-pre-wrap">{featureRequest.description}</p>
            </div>
          </div>
        </div>
      </CardContent>
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your feature request and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteFeatureRequest} className="bg-red-500 hover:bg-red-600">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
} 