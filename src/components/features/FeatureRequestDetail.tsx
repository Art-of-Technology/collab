"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Hourglass,
  CheckCircle,
  XCircle,
  ThumbsUp,
  MoreVertical,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Pencil,
  Loader2
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
import { MarkdownContent } from "@/components/ui/markdown-content";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useVoteOnFeature, useUpdateFeatureStatus } from "@/hooks/queries/useFeature";
import { useQueryClient } from "@tanstack/react-query";
import { featureKeys } from "@/hooks/queries/useFeature";
import { useCanEditFeatureRequests } from "@/hooks/use-permissions";
import { useWorkspace } from "@/context/WorkspaceContext";

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
  const queryClient = useQueryClient();
  const voteOnFeature = useVoteOnFeature();
  const updateStatus = useUpdateFeatureStatus();
  const { currentWorkspace } = useWorkspace();
  const { hasPermission: canEditFeatureRequests } = useCanEditFeatureRequests(currentWorkspace?.id);
  
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
  
  // Edit feature request state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(featureRequest.title);
  const [editDescription, setEditDescription] = useState(featureRequest.description);
  const [editDescriptionHtml, setEditDescriptionHtml] = useState(featureRequest.html || "");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  
  const isAuthor = currentUserId === featureRequest.author.id;
  // Use permission system instead of hardcoded admin check
  const canManageFeatures = canEditFeatureRequests || isAdmin;

  const handleVote = (value: 1 | -1) => {
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
      voteOnFeature.mutate(
        { featureRequestId: featureRequest.id, value },
        {
          onSuccess: () => {
            // Since we don't have access to the returned data structure,
            // just update the UI with optimistic updates instead
            setVoteScore(prev => prev + value); 
            if (value === 1) {
              setUpvotes(prev => prev + 1);
              // If user was previously downvoting, remove that downvote
              if (currentUserVote === -1) {
                setDownvotes(prev => Math.max(0, prev - 1));
              }
            } else {
              setDownvotes(prev => prev + 1);
              // If user was previously upvoting, remove that upvote
              if (currentUserVote === 1) {
                setUpvotes(prev => Math.max(0, prev - 1));
              }
            }
            
            setCurrentUserVote(value);
            
            toast({
              title: "Success",
              description: "Your vote has been recorded",
            });
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to register your vote",
              variant: "destructive",
            });
          },
          onSettled: () => {
            setIsVoting(false);
          }
        }
      );
    } catch (error) {
      console.error("Vote error:", error);
      toast({
        title: "Error",
        description: "Failed to vote on this feature request",
        variant: "destructive",
      });
      setIsVoting(false);
    }
  };

  const handleStatusChange = (status: string) => {
    if (isUpdatingStatus) return;
    setStatusError(null);
    
    setIsUpdatingStatus(true);
    try {
      updateStatus.mutate(
        { featureRequestId: featureRequest.id, status: status as any },
        {
          onSuccess: () => {
            // Update the local status state
            setCurrentStatus(status);
            
            toast({
              title: "Success",
              description: `Status updated to ${status}`,
            });
          },
          onError: () => {
            toast({
              title: "Error",
              description: "Failed to update status",
              variant: "destructive",
            });
          },
          onSettled: () => {
            setIsUpdatingStatus(false);
          }
        }
      );
      
      router.refresh();
    } catch (error) {
      console.error("Status update error:", error);
      setStatusError((error as Error).message || "Failed to update the status");
      
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to update the status",
        variant: "destructive",
      });
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

      // Invalidate queries to update the list
      queryClient.invalidateQueries({ queryKey: featureKeys.lists() });
      
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

  // AI Improve handler for edit description
  const handleAiImproveDescription = useCallback(async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;
    setIsImproving(true);
    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error("Failed to improve text");
      const data = await response.json();
      return data.message || data.improvedText || text;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({ title: "Error", description: "Failed to improve text", variant: "destructive" });
      return text;
    } finally {
      setIsImproving(false);
    }
  }, [isImproving, toast]);

  // Handle updating feature request
  const handleUpdateFeatureRequest = async () => {
    if (!editTitle.trim() || !editDescription.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/features/${featureRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          html: editDescriptionHtml,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update feature request");
      }

      await response.json();
      
      // Invalidate queries to update both the detail and list views
      queryClient.invalidateQueries({ 
        queryKey: featureKeys.detail(featureRequest.id) 
      });
      queryClient.invalidateQueries({ queryKey: featureKeys.lists() });
      
      // Update UI
      setIsEditDialogOpen(false);
      toast({
        title: "Success",
        description: "Feature request updated successfully"
      });
      
      // Refresh the page to show updated content
      router.refresh();
    } catch (error) {
      console.error("Error updating feature request:", error);
      toast({
        title: "Error",
        description: "Failed to update feature request",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
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
        
        {(canManageFeatures || isAuthor) && (
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-secondary/80 transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {canManageFeatures && (
                  <>
                    <DropdownMenuItem 
                      onClick={() => handleStatusChange("pending")}
                      disabled={isUpdatingStatus || currentStatus === "pending"}
                      className="hover:text-yellow-600 cursor-pointer"
                    >
                      <Hourglass className="mr-2 h-4 w-4 text-yellow-500" />
                      <span>Mark as Pending</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleStatusChange("accepted")}
                      disabled={isUpdatingStatus || currentStatus === "accepted"}
                      className="hover:text-green-600 cursor-pointer"
                    >
                      <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                      <span>Accept</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleStatusChange("rejected")}
                      disabled={isUpdatingStatus || currentStatus === "rejected"}
                      className="hover:text-red-600 cursor-pointer"
                    >
                      <XCircle className="mr-2 h-4 w-4 text-red-500" />
                      <span>Reject</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleStatusChange("completed")}
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
                  <>
                    <DropdownMenuItem 
                      onClick={() => setIsEditDialogOpen(true)}
                      disabled={isUpdating}
                      className="hover:text-primary cursor-pointer"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      <span>Edit Request</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem 
                      onClick={() => setIsDeleteDialogOpen(true)}
                      disabled={isDeleting}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                    >
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      {isDeleting ? "Deleting..." : "Delete Request"}
                    </DropdownMenuItem>
                  </>
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
              <ChevronUp className="h-6 w-6" />
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
              <ChevronDown className="h-6 w-6" />
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
                  content={featureRequest.description}
                  htmlContent={featureRequest.html} 
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
      
      {/* Edit feature request dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Feature Request</DialogTitle>
            <DialogDescription>
              Update your feature request details. Be descriptive so others understand your idea.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Brief title for your feature idea"
                className="col-span-3"
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description</Label>
              <MarkdownEditor
                initialValue={editDescription}
                onChange={(markdown, html) => {
                  setEditDescription(markdown);
                  setEditDescriptionHtml(html);
                }}
                placeholder="Describe your feature idea in detail. What problem does it solve? How should it work?"
                minHeight="180px"
                onAiImprove={handleAiImproveDescription}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateFeatureRequest}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
} 