"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Users, Check, X, Clock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LoadingState } from "@/components/issue/sections/activity/components/LoadingState";

interface IssueHelper {
  id: string;
  userId: string;
  role: "ASSIGNEE" | "HELPER";
  status: "PENDING" | "APPROVED" | "REJECTED";
  assignedAt: string;
  approvedAt?: string | null;
  totalTimeWorked: number;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

interface IssueHelpersSectionProps {
  issueId: string;
  assigneeId?: string | null;
  reporterId?: string | null;
  currentUserId?: string;
  onRefresh?: () => void;
}

export function IssueHelpersSection({ 
  issueId, 
  assigneeId, 
  reporterId, 
  currentUserId, 
  onRefresh 
}: IssueHelpersSectionProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [helpers, setHelpers] = useState<IssueHelper[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [requestingHelp, setRequestingHelp] = useState(false);

  const userId = currentUserId || session?.user?.id;
  const canApproveHelpers = userId === assigneeId || userId === reporterId;
  const isAlreadyAssigned = userId === assigneeId;
  
  // Check if current user has any pending or approved request
  const userHelperRecord = helpers.find((h) => h.userId === userId);
  const hasExistingRequest = userHelperRecord && (userHelperRecord.status === "PENDING" || userHelperRecord.status === "APPROVED");
  
  // Debug logging (remove in production)
  // console.log("Issue Helpers Debug:", {
  //   userId, assigneeId, reporterId, isAlreadyAssigned, canApproveHelpers,
  //   userHelperRecord, hasExistingRequest, helpersCount: helpers.length
  // });

  // Fetch helpers for this issue
  const fetchHelpers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/issues/${issueId}/helpers`);
      if (response.ok) {
        const data = await response.json();
        setHelpers(data.helpers || []);
      }
    } catch (error) {
      console.error("Error fetching helpers:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHelpers();
  }, [issueId, assigneeId, reporterId]); // Refresh when assignee/reporter changes

  // Request help on this issue
  const requestHelp = async () => {
    setRequestingHelp(true);
    try {
      const response = await fetch(`/api/issues/${issueId}/request-help`, {
        method: "POST",
      });

      if (response.ok) {
        toast({
          title: "Help Requested",
          description: "Your help request has been sent to the issue assignee and reporter.",
        });
        fetchHelpers();
        onRefresh?.();
      } else {
        const error = await response.json();
        throw new Error(error.message || "Failed to request help");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to request help",
        variant: "destructive",
      });
    } finally {
      setRequestingHelp(false);
    }
  };

  // Approve or reject a help request
  const handleHelpRequest = async (helperId: string, action: "approve" | "reject") => {
    setActionLoading(helperId);
    try {
      const response = await fetch(`/api/issues/${issueId}/approve-help`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ helperId, action }),
      });

      if (response.ok) {
        toast({
          title: `Help Request ${action === "approve" ? "Approved" : "Rejected"}`,
          description: `The help request has been ${action}d.`,
        });
        fetchHelpers();
        onRefresh?.();
      } else {
        const error = await response.json();
        throw new Error(error.message || `Failed to ${action} help request`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to ${action} help request`,
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Format time worked
  const formatTimeWorked = (milliseconds: number) => {
    if (milliseconds === 0) return "No time logged";

    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Filter helpers - exclude the current user from lists when they're the assignee
  const pendingHelpers = helpers.filter((h) => 
    h.role === "HELPER" && 
    h.status === "PENDING" && 
    !(isAlreadyAssigned && h.userId === userId) // Don't show your own request if you're the assignee
  );
  const approvedHelpers = helpers.filter((h) => 
    h.role === "HELPER" && 
    h.status === "APPROVED" && 
    !(isAlreadyAssigned && h.userId === userId) // Don't show your own approval if you're the assignee
  );
  const hasHelpRequests = pendingHelpers.length > 0 || approvedHelpers.length > 0;

  return (
    <div>
      {pendingHelpers.length > 0 && (
        <div className="mb-4">
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
            {pendingHelpers.length} pending request{pendingHelpers.length > 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      <div>
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center">
            <LoadingState size="sm" className="h-5 w-5 text-[#666]" noPadding={true} />
            <span className="ml-2 text-sm text-[#888]">Loading team members...</span>
          </div>
        )}

        {/* Content when not loading */}
        {!loading && (
          <>
            {/* Pending Help Requests (only visible to assignee/reporter) */}
            {canApproveHelpers && pendingHelpers.length > 0 && (
              <div className="space-y-3 mb-6">
                <h4 className="text-xs font-medium text-[#888] uppercase tracking-wide">Pending Requests</h4>
                {pendingHelpers.map((helper) => (
                  <div key={helper.id} className="flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={helper.user.image || undefined} alt={helper.user.name || ""} />
                        <AvatarFallback className="bg-[#1a1a1a] text-[#ccc]">
                          {helper.user.name?.substring(0, 2) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-[#e1e7ef]">{helper.user.name}</p>
                        <p className="text-xs text-[#888]">Requested {new Date(helper.assignedAt).toLocaleDateString()}</p>
                      </div>
                      <Badge variant="outline" className="ml-2 border-amber-500/30 text-amber-400">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleHelpRequest(helper.userId, "reject")}
                        disabled={actionLoading === helper.userId}
                        className="h-7 w-7 p-0 border-red-500/30 hover:bg-red-500/20 hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleHelpRequest(helper.userId, "approve")}
                        disabled={actionLoading === helper.userId}
                        className="h-7 w-7 p-0 bg-green-600/20 hover:bg-green-600/30 border-green-600/30 text-green-400"
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Approved Helpers */}
            {approvedHelpers.length > 0 && (
              <div className="space-y-3 mb-6">
                <h4 className="text-xs font-medium text-[#888] uppercase tracking-wide">Active Team Members</h4>
                {approvedHelpers.map((helper) => (
                  <div key={helper.id} className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={helper.user.image || undefined} alt={helper.user.name || ""} />
                        <AvatarFallback className="bg-[#1a1a1a] text-[#ccc]">
                          {helper.user.name?.substring(0, 2) || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-[#e1e7ef]">{helper.user.name}</p>
                        <p className="text-xs text-[#888]">{formatTimeWorked(helper.totalTimeWorked)}</p>
                      </div>
                      <Badge className="ml-2 bg-green-600/20 text-green-400 border-green-600/30">
                        <Check className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State and Actions */}
            {!hasHelpRequests && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-[#333] mb-3" />
                <p className="text-sm text-[#ccc] font-medium mb-1">No team members</p>
                <p className="text-xs text-[#666] mb-4">This issue doesn't have any team members working on it yet.</p>
                
                {!isAlreadyAssigned && !hasExistingRequest && (
                  <Button 
                    variant="outline" 
                    onClick={requestHelp} 
                    disabled={requestingHelp} 
                    size="sm"
                    className="border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    {requestingHelp ? "Requesting..." : "Request to Help"}
                  </Button>
                )}
                
                {hasExistingRequest && !isAlreadyAssigned && (
                  <div className="text-center">
                    <p className="text-xs text-[#666]">
                      {userHelperRecord?.status === "PENDING" 
                        ? "Your help request is pending approval." 
                        : userHelperRecord?.status === "APPROVED"
                        ? "You are approved to help with this issue."
                        : "You have already requested to help with this issue."}
                    </p>
                  </div>
                )}
                
                {isAlreadyAssigned && (
                  <p className="text-xs text-[#666]">You are the assignee of this issue.</p>
                )}
              </div>
            )}

            {/* Request Help Button for when there are existing helpers */}
            {hasHelpRequests && !isAlreadyAssigned && !hasExistingRequest && (
              <div className="pt-4 border-t border-[#1f1f1f]">
                <Button 
                  variant="outline" 
                  onClick={requestHelp} 
                  disabled={requestingHelp} 
                  className="w-full border-[#333] hover:bg-[#1a1a1a] hover:border-[#444] text-[#ccc]"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {requestingHelp ? "Requesting..." : "Request to Help"}
                </Button>
              </div>
            )}

            {/* Status Message for existing request when there are helpers */}
            {hasHelpRequests && hasExistingRequest && !isAlreadyAssigned && (
              <div className="pt-4 border-t border-[#1f1f1f]">
                <p className="text-sm text-[#666] text-center">You have already requested to help with this issue.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
