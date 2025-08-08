"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Settings, BarChart3, ChevronRight } from "lucide-react";
import LeavePolicyList from "@/components/hr/LeavePolicyList";
import { useLeavePolicies } from "@/hooks/queries/useLeavePolicies";

interface LeavePolicyManagementClientProps {
  workspaceId: string;
}

export default function LeavePolicyManagementClient({
  workspaceId,
}: LeavePolicyManagementClientProps) {
  const [activeTab, setActiveTab] = useState("policies");
  
  const { data: allPolicies } = useLeavePolicies(workspaceId, true);
  const { data: visiblePolicies } = useLeavePolicies(workspaceId, false);

  const hiddenCount = (allPolicies?.length || 0) - (visiblePolicies?.length || 0);
  const usedPolicies = allPolicies?.filter(p => p._count && p._count.leaveRequests > 0) || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center space-x-1 text-sm text-muted-foreground border-bone dark:border-none">
        <Link 
          href={`/${workspaceId}/leave-management`}
          className="hover:text-foreground transition-colors"
        >
          Leave Management
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Policy Management</span>
      </nav>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leave Policy Management</h1>
          <p className="text-muted-foreground">
            Configure and manage leave types for your organization
          </p>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Policies</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allPolicies?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {visiblePolicies?.length || 0} visible, {hiddenCount} hidden
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Policies</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usedPolicies.length}</div>
            <p className="text-xs text-muted-foreground">
              Policies with leave requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid Policies</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {allPolicies?.filter(p => p.isPaid).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Out of {allPolicies?.length || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Policy Groups</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(allPolicies?.map(p => p.group).filter(Boolean)).size || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Unique groups defined
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Policy Groups Overview */}
      {allPolicies && allPolicies.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Policy Groups</CardTitle>
            <CardDescription>
              Overview of policies organized by groups
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(allPolicies.map(p => p.group).filter(Boolean))).map(group => {
                const groupPolicies = allPolicies.filter(p => p.group === group);
                const paidCount = groupPolicies.filter(p => p.isPaid).length;
                
                return (
                  <div key={group} className="flex items-center space-x-2 p-3 border rounded-lg">
                    <div>
                      <Badge variant="secondary">{group}</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {groupPolicies.length} policies, {paidCount} paid
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {allPolicies.some(p => !p.group) && (
                <div className="flex items-center space-x-2 p-3 border rounded-lg">
                  <div>
                    <Badge variant="outline">No Group</Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {allPolicies.filter(p => !p.group).length} policies
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <LeavePolicyList workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Policy Settings</CardTitle>
              <CardDescription>
                Global settings for leave policy management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Default Settings</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Configure default settings for new leave policies.
                  </p>
                  <Button variant="outline" disabled>
                    <Settings className="h-4 w-4 mr-2" />
                    Configure Defaults
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Coming soon - configure default accrual rates, rollover settings, and more.
                  </p>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Import/Export</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Bulk import policies or export current configuration.
                  </p>
                  <div className="space-x-2">
                    <Button variant="outline" disabled>
                      Import Policies
                    </Button>
                    <Button variant="outline" disabled>
                      Export Policies
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Coming soon - bulk operations for policy management.
                  </p>
                </div>

                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Audit & Compliance</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    View policy change history and compliance reports.
                  </p>
                  <Button variant="outline" disabled>
                    View Audit Log
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Coming soon - track all policy changes and access patterns.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}