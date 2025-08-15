"use client";

import React, { useState } from "react";
import { 
  Calendar, 
  Clock, 
  CheckCircle, 
  XCircle, 
  User, 
  Search,
  MoreHorizontal,
  Calendar as CalendarIcon,
  AlertCircle,
  Eye
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationButton,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { format, differenceInDays } from "date-fns";
import {
  LeaveStatus,
  LeaveDuration,
  LeaveRequestWithUser,
} from "@/types/leave";
import { Skeleton } from "../ui/skeleton";

interface LeaveRequestsManagerProps {
  data?: {
    data: LeaveRequestWithUser[];
    pagination: {
      total: number;
      take: number;
      skip: number;
      hasMore: boolean;
      totalPages: number;
      currentPage: number;
    };
  };
  summaryData?: {
    pending: number;
    approved: number;
    rejected: number;
    canceled: number;
    total: number;
  };
  isLoading?: boolean;
  onApprove?: (requestId: string, notes?: string) => Promise<void>;
  onReject?: (requestId: string, notes?: string) => Promise<void>;
  onPageChange?: (page: number) => void;
  onStatusFilterChange?: (
    status: "all" | "pending" | "approved" | "rejected"
  ) => void;
  currentStatusFilter?: "all" | "pending" | "approved" | "rejected";
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export function LeaveRequestsManager({
  data,
  summaryData,
  isLoading = false,
  onApprove,
  onReject,
  onPageChange,
  onStatusFilterChange,
  currentStatusFilter = "all",
}: LeaveRequestsManagerProps) {
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestWithUser | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Extract data from the server response
  const requests = data?.data || [];
  const pagination = data?.pagination;

  // Handle status filter changes
  const handleStatusFilterChange = (value: string) => {
    const newStatus = value as StatusFilter;
    onStatusFilterChange?.(newStatus);
  };

  // Handle page changes
  const handlePageChange = (page: number) => {
    onPageChange?.(page);
  };

  // Use summary data from server (total counts across all pages)
  const requestSummary = summaryData || { pending: 0, approved: 0, rejected: 0, canceled: 0, total: 0 };

  const getStatusBadge = (status?: LeaveStatus) => {
    if (!status) return null;

    const statusColors = {
      'APPROVED': 'bg-green-500/10 text-green-600',
      'REJECTED': 'bg-red-500/10 text-red-600',
      'PENDING': 'bg-yellow-500/10 text-yellow-600',
      'CANCELED': 'bg-muted text-muted-foreground',
    };

    const color = statusColors[status] || 'bg-muted text-muted-foreground';

    return (
      <Badge variant="outline" className={`${color} capitalize`}>
        {status.toLowerCase()}
      </Badge>
    );
  };

  const getDurationLabel = (duration: LeaveDuration) => {
    return duration === "FULL_DAY" ? "Full Day" : "Half Day";
  };

  const formatDateRange = (startDate: Date, endDate: Date) => {
    const start = format(startDate, "MMM d, yyyy");
    const end = format(endDate, "MMM d, yyyy");
    return start === end ? start : `${start} - ${end}`;
  };

  const getDaysCount = (startDate: Date, endDate: Date, duration: LeaveDuration) => {
    const daysDiff = differenceInDays(endDate, startDate) + 1;
    return duration === "HALF_DAY" ? daysDiff * 0.5 : daysDiff;
  };

  const getRequestPriority = (request: LeaveRequestWithUser) => {
    const startDate = new Date(request.startDate);
    const today = new Date();
    const daysUntilStart = differenceInDays(startDate, today);
    
    if (daysUntilStart < 0) return "overdue";
    if (daysUntilStart <= 3) return "urgent";
    if (daysUntilStart <= 7) return "high";
    return "normal";
  };

  const handleAction = async (type: "approve" | "reject", request: LeaveRequestWithUser) => {
    setSelectedRequest(request);
    setActionType(type);
    setActionNotes("");
    setActionDialogOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedRequest || !actionType) return;

    setIsSubmitting(true);
    try {
      if (actionType === "approve" && onApprove) {
        await onApprove(selectedRequest.id, actionNotes);
        toast({
          title: "Request Approved",
          description: `Leave request for ${selectedRequest.user.name} has been approved.`,
        });
      } else if (actionType === "reject" && onReject) {
        await onReject(selectedRequest.id, actionNotes);
        toast({
          title: "Request Rejected",
          description: `Leave request for ${selectedRequest.user.name} has been rejected.`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update leave request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
      setActionDialogOpen(false);
      setSelectedRequest(null);
      setActionType(null);
    }
  };

  const showDetails = (request: LeaveRequestWithUser) => {
    setSelectedRequest(request);
    setDetailsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-8" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col-reverse lg:flex-col gap-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{requestSummary.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-2xl font-bold text-green-600">{requestSummary.approved}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejected</p>
                <p className="text-2xl font-bold text-red-600">{requestSummary.rejected}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{requestSummary.total}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Leave Requests
            </CardTitle>
            <Select value={currentStatusFilter} onValueChange={handleStatusFilterChange}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Requests</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {/* Requests Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {currentStatusFilter !== "all"
                        ? "No requests match your filters."
                        : "No leave requests found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((request) => {
                    const priority = getRequestPriority(request);
                    const daysCount = getDaysCount(
                      new Date(request.startDate), 
                      new Date(request.endDate), 
                      request.duration
                    );
                    
                    return (
                      <TableRow key={request.id} className={priority === "urgent" ? "bg-red-500/10" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={request.user.avatar || request.user.image || ""} />
                              <AvatarFallback>
                                {request.user.name?.charAt(0)?.toUpperCase() || request.user.email?.charAt(0)?.toUpperCase() || "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{request.user.name || "Unknown"}</p>
                              <p className="text-sm text-muted-foreground">{request.user.email || "No email"}</p>
                            </div>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          <div>
                            <p className="font-medium">{request.policy?.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {request.policy?.isPaid ? "Paid" : "Unpaid"}
                            </p>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {formatDateRange(new Date(request.startDate), new Date(request.endDate))}
                            </span>
                          </div>
                          {priority === "urgent" && (
                            <div className="flex items-center gap-1 mt-1">
                              <AlertCircle className="h-3 w-3 text-red-500" />
                              <span className="text-xs text-red-500">Urgent</span>
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell>
                          <div className="text-sm">
                            <span className="font-medium">{daysCount}</span>
                            <span className="text-muted-foreground ml-1">
                              {daysCount === 1 ? "day" : "days"}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {getDurationLabel(request.duration)}
                            </p>
                          </div>
                        </TableCell>
                        
                        <TableCell>
                          {getStatusBadge(request.status)}
                        </TableCell>
                        
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(request.createdAt), "MMM d, yyyy")}
                          </span>
                        </TableCell>
                        
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => showDetails(request)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              {request.status === "PENDING" && (
                                <>
                                  <DropdownMenuItem 
                                    onClick={() => handleAction("approve", request)}
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleAction("reject", request)}
                                    className="text-red-600"
                                  >
                                    <XCircle className="h-4 w-4 mr-2" />
                                    Reject
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between px-2 py-4 gap-2">
              <div className="text-xs text-muted-foreground">
                Showing {pagination.skip + 1} to{" "}
                {Math.min(pagination.skip + pagination.take, pagination.total)}{" "}
                of {pagination.total} requests
              </div>

              <Pagination className="flex-1 flex sm:justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        handlePageChange(pagination.currentPage - 1)
                      }
                      className={
                        pagination.currentPage <= 1
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                      aria-disabled={pagination.currentPage <= 1}
                      size="sm"
                    />
                  </PaginationItem>

                  {/* Page numbers */}
                  {Array.from(
                    { length: Math.min(5, pagination.totalPages) },
                    (_, i) => {
                      let pageNum;
                      if (pagination.totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (pagination.currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (
                        pagination.currentPage >=
                        pagination.totalPages - 2
                      ) {
                        pageNum = pagination.totalPages - 4 + i;
                      } else {
                        pageNum = pagination.currentPage - 2 + i;
                      }

                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationButton
                            onClick={() => handlePageChange(pageNum)}
                            isActive={pagination.currentPage === pageNum}
                            className="cursor-pointer"
                            size="sm"
                          >
                            {pageNum}
                          </PaginationButton>
                        </PaginationItem>
                      );
                    }
                  )}

                  {pagination.totalPages > 5 &&
                    pagination.currentPage < pagination.totalPages - 2 && (
                      <>
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationButton
                            onClick={() =>
                              handlePageChange(pagination.totalPages)
                            }
                            className="cursor-pointer"
                            size="sm"
                          >
                            {pagination.totalPages}
                          </PaginationButton>
                        </PaginationItem>
                      </>
                    )}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        handlePageChange(pagination.currentPage + 1)
                      }
                      className={
                        pagination.currentPage >= pagination.totalPages
                          ? "pointer-events-none opacity-50"
                          : "cursor-pointer"
                      }
                      aria-disabled={
                        pagination.currentPage >= pagination.totalPages
                      }
                      size="sm"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Confirmation Dialog */}
      <AlertDialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "approve" ? "Approve" : "Reject"} Leave Request
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {actionType} this leave request for{" "}
              <strong>{selectedRequest?.user.name}</strong>?
              <br />
              <br />
              <span className="text-sm">
                <strong>Dates:</strong> {selectedRequest && formatDateRange(
                  new Date(selectedRequest.startDate), 
                  new Date(selectedRequest.endDate)
                )}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="my-4">
            <Label className="text-muted-foreground">
              Notes (optional)
            </Label>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder={`Add a note...`}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction}
              disabled={isSubmitting}
              className={actionType === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isSubmitting ? "Processing..." : actionType === "approve" ? "Approve" : "Reject"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-6">
              {/* Employee Info */}
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedRequest.user.avatar || selectedRequest.user.image || ""} />
                  <AvatarFallback className="text-lg">
                    {selectedRequest.user.name?.charAt(0)?.toUpperCase() || selectedRequest.user.email?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{selectedRequest.user.name}</h3>
                  <p className="text-muted-foreground">{selectedRequest.user.email || "No email"}</p>
                </div>
              </div>

              {/* Request Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Leave Type</Label>
                  <p className="font-medium">{selectedRequest.policy?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.policy?.isPaid ? "Paid Leave" : "Unpaid Leave"}
                  </p>
                </div>
                
                <div>
                  <Label className="text-muted-foreground mr-2">Status</Label>
                  {getStatusBadge(selectedRequest.status)}
                </div>
                
                <div>
                  <Label className="text-muted-foreground">Duration</Label>
                  <p className="font-medium">{getDurationLabel(selectedRequest.duration)}</p>
                  <p className="text-sm text-muted-foreground">
                    {getDaysCount(
                      new Date(selectedRequest.startDate), 
                      new Date(selectedRequest.endDate), 
                      selectedRequest.duration
                    )} days total
                  </p>
                </div>
                
                <div>
                  <Label className="text-muted-foreground">Submitted</Label>
                  <p className="font-medium">
                    {format(new Date(selectedRequest.createdAt), "MMM d, yyyy 'at' h:mm a")}
                  </p>
                </div>
              </div>

              {/* Date Range */}
              <div>
                <Label className="text-muted-foreground">Date Range</Label>
                <p className="font-medium">
                  {formatDateRange(
                    new Date(selectedRequest.startDate), 
                    new Date(selectedRequest.endDate)
                  )}
                </p>
              </div>

              {/* Notes */}
              <div>
                <Label className="text-muted-foreground">Notes</Label>
                <p className="mt-1 p-3 border rounded-md text-sm">
                  {selectedRequest.notes || "No notes provided."}
                </p>
              </div>

              {/* Action Buttons (if pending) */}
              {selectedRequest.status === "PENDING" && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() => {
                      setDetailsDialogOpen(false);
                      handleAction("approve", selectedRequest);
                    }}
                    variant="outline"
                    className="h-8 px-3 text-green-600 border-green-500/20 hover:bg-green-500/10 hover:text-green-700 flex-1 sm:flex-none"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    onClick={() => {
                      setDetailsDialogOpen(false);
                      handleAction("reject", selectedRequest);
                    }}
                    variant="outline"
                    className="h-8 px-3 text-red-600 border-red-500/20 hover:bg-red-500/10 hover:text-red-700 flex-1 sm:flex-none"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}