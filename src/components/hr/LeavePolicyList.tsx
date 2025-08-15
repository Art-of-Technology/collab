"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  AlertTriangle,
  FileText,
  Clock,
  Calendar,
} from "lucide-react";
import { format } from "date-fns";
import {
  useLeavePolicies,
  useDeleteLeavePolicy,
  type LeavePolicy,
} from "@/hooks/queries/useLeavePolicies";
import LeavePolicyForm from "@/components/hr/forms/LeavePolicyForm";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LeavePolicyListProps {
  workspaceId: string;
}

export default function LeavePolicyList({ workspaceId }: LeavePolicyListProps) {
  const [editingPolicy, setEditingPolicy] = useState<LeavePolicy | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<LeavePolicy | null>(null);
  const [viewingPolicy, setViewingPolicy] = useState<LeavePolicy | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [includeHidden, setIncludeHidden] = useState(false);

  const {
    data: policies,
    isLoading,
    error,
  } = useLeavePolicies(workspaceId, includeHidden);

  const deleteMutation = useDeleteLeavePolicy();

  // Helper function to check if policy can be deleted (moved outside of hook)
  const canDeletePolicy = (policy: LeavePolicy) => {
    const hasActiveRequests = policy._count?.leaveRequests && policy._count.leaveRequests > 0;
    return {
      canDelete: !hasActiveRequests,
      reason: hasActiveRequests 
        ? `Policy has ${policy._count?.leaveRequests || 0} pending or approved leave request(s)`
        : undefined,
    };
  };

  const handleDelete = async (policy: LeavePolicy) => {
    try {
      await deleteMutation.mutateAsync(policy.id);
      setDeletingPolicy(null);
    } catch (error) {
      // Error handled by the hook
    }
  };

  const formatRolloverType = (type: string | null) => {
    if (!type) return "None";
    switch (type) {
      case "ENTIRE_BALANCE":
        return "Entire Balance";
      case "PARTIAL_BALANCE":
        return "Partial Balance";
      default:
        return "None";
    }
  };

  const formatExportMode = (mode: string) => {
    switch (mode) {
      case "DO_NOT_EXPORT":
        return "Do Not Export";
      case "EXPORT_WITH_PAY_CONDITION":
        return "Export with Pay Condition";
      case "EXPORT_WITH_CODE":
        return "Export with Code";
      default:
        return mode;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load leave policies: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Leave Policies</h2>
          <p className="text-muted-foreground">
            Manage leave types and their settings for your workspace
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIncludeHidden(!includeHidden)}
          >
            {includeHidden ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                Hide Hidden
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Show Hidden
              </>
            )}
          </Button>
          <Button onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Policy
          </Button>
        </div>
      </div>

      {policies && policies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No leave policies found</h3>
            <p className="text-muted-foreground mb-4 text-center">
              Create your first leave policy to get started with leave management.
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {policies?.length || 0} Policies
              {includeHidden && (
                <Badge variant="secondary" className="ml-2">
                  Including Hidden
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Track In</TableHead>
                  <TableHead>Max Balance</TableHead>
                  <TableHead>Rollover</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies?.map((policy) => {
                  const { canDelete, reason } = canDeletePolicy(policy);
                  
                  return (
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center space-x-2">
                          <span>{policy.name}</span>
                          {policy.isHidden && (
                            <Badge variant="outline" className="text-xs">
                              Hidden
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {policy.group ? (
                          <Badge variant="secondary">{policy.group}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          {policy.isPaid ? (
                            <Badge variant="default">Paid</Badge>
                          ) : (
                            <Badge variant="outline">Unpaid</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-1">
                          {policy.trackIn === "HOURS" ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <Calendar className="h-3 w-3" />
                          )}
                          <span className="text-sm">
                            {policy.trackIn === "HOURS" ? "Hours" : "Days"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {policy.maxBalance ? (
                          <span>{policy.maxBalance}</span>
                        ) : (
                          <span className="text-muted-foreground">Unlimited</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatRolloverType(policy.rolloverType)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {policy._count?.leaveRequests ? (
                          <Badge variant="secondary">
                            {policy._count.leaveRequests} requests
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            No usage
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={policy.accrualType === "FIXED" ? "default" : "secondary"}
                        >
                          {policy.accrualType === "FIXED" ? "Fixed" : 
                           policy.accrualType === "HOURLY" ? "Hourly" :
                           policy.accrualType === "REGULAR_WORKING_HOURS" ? "Regular Hours" : "No Accrual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setViewingPolicy(policy)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setEditingPolicy(policy)}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeletingPolicy(policy)}
                              disabled={!canDelete}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                              {!canDelete && (
                                <span className="ml-auto text-xs text-muted-foreground">
                                  In use
                                </span>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Policy Dialog */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Leave Policy</DialogTitle>
          </DialogHeader>
          <LeavePolicyForm
            workspaceId={workspaceId}
            onSuccess={() => setShowCreateForm(false)}
            onCancel={() => setShowCreateForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Policy Dialog */}
      <Dialog
        open={!!editingPolicy}
        onOpenChange={(open) => !open && setEditingPolicy(null)}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Leave Policy</DialogTitle>
          </DialogHeader>
          {editingPolicy && (
            <LeavePolicyForm
              workspaceId={workspaceId}
              policy={editingPolicy}
              onSuccess={() => setEditingPolicy(null)}
              onCancel={() => setEditingPolicy(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* View Policy Dialog */}
      <Dialog
        open={!!viewingPolicy}
        onOpenChange={(open) => !open && setViewingPolicy(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Policy Details</DialogTitle>
          </DialogHeader>
          {viewingPolicy && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Name</h4>
                  <p>{viewingPolicy.name}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Group</h4>
                  <p>{viewingPolicy.group || "—"}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Type</h4>
                  <Badge variant={viewingPolicy.isPaid ? "default" : "outline"}>
                    {viewingPolicy.isPaid ? "Paid" : "Unpaid"}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Track In</h4>
                  <p>{viewingPolicy.trackIn === "HOURS" ? "Hours" : "Days"}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Accrual Type</h4>
                  <Badge variant={viewingPolicy.accrualType === "FIXED" ? "default" : "secondary"}>
                    {viewingPolicy.accrualType === "FIXED" ? "Fixed" : 
                     viewingPolicy.accrualType === "HOURLY" ? "Hourly" :
                     viewingPolicy.accrualType === "REGULAR_WORKING_HOURS" ? "Regular Working Hours" : "Does Not Accrue"}
                  </Badge>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Max Balance</h4>
                  <p>{viewingPolicy.maxBalance || "Unlimited"}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Rollover Type</h4>
                  <p>{formatRolloverType(viewingPolicy.rolloverType)}</p>
                </div>
                {viewingPolicy.rolloverAmount && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Rollover Amount</h4>
                    <p>{viewingPolicy.rolloverAmount}</p>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Export Mode</h4>
                  <p>{formatExportMode(viewingPolicy.exportMode)}</p>
                </div>
                {viewingPolicy.exportCode && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Export Code</h4>
                    <p>{viewingPolicy.exportCode}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground">Settings</h4>
                <div className="flex flex-wrap gap-2">
                  {viewingPolicy.deductsLeave && (
                    <Badge variant="outline">Deducts Leave</Badge>
                  )}
                  {viewingPolicy.allowOutsideLeaveYearRequest && (
                    <Badge variant="outline">Outside Year Requests</Badge>
                  )}
                  {viewingPolicy.useAverageWorkingHours && (
                    <Badge variant="outline">Average Working Hours</Badge>
                  )}
                  {viewingPolicy.isHidden && (
                    <Badge variant="outline">Hidden</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium">Created:</span>{" "}
                  {format(new Date(viewingPolicy.createdAt), "PPP")}
                </div>
                <div>
                  <span className="font-medium">Updated:</span>{" "}
                  {format(new Date(viewingPolicy.updatedAt), "PPP")}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingPolicy}
        onOpenChange={(open) => !open && setDeletingPolicy(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leave Policy</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingPolicy?.name}"? This action cannot be undone.
              {deletingPolicy && !canDeletePolicy(deletingPolicy).canDelete && (
                <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <div className="flex items-center space-x-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Cannot delete policy</span>
                  </div>
                  <p className="text-sm text-destructive/80 mt-1">
                    {canDeletePolicy(deletingPolicy).reason}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPolicy && handleDelete(deletingPolicy)}
              disabled={
                deletingPolicy
                  ? !canDeletePolicy(deletingPolicy).canDelete
                  : false
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Policy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}