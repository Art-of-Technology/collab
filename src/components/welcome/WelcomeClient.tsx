"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Plus, Mail, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePendingInvitations } from "@/hooks/queries/useInvitation";
import { useSession } from "next-auth/react";

interface WelcomeClientProps {
  initialInvitations: any[];
}

export default function WelcomeClient({ initialInvitations }: WelcomeClientProps) {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<string>("workspaces");
  
  // Fetch invitations with TanStack Query
  const { data: invitations, isLoading } = usePendingInvitations(
    session?.user?.email || null
  );
  
  // Use the fetched data or fall back to the initial server-rendered data
  const pendingInvitations = invitations || initialInvitations;
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  return (
    <div>
      <div className="flex flex-col items-center text-center mb-8">
        <Building2 className="h-16 w-16 text-primary mb-4" />
        <h1 className="text-3xl font-bold">Welcome to Collab</h1>
        <p className="text-muted-foreground mt-2 max-w-lg">
          You don&apos;t have access to any workspaces yet. Create a new workspace or accept an invitation to get started.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 mb-8">
          <TabsTrigger value="workspaces">Create Workspace</TabsTrigger>
          <TabsTrigger value="invitations" className="relative">
            Invitations
            {pendingInvitations.length > 0 && (
              <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {pendingInvitations.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workspaces">
          <Card>
            <CardHeader>
              <CardTitle>Create a new workspace</CardTitle>
              <CardDescription>
                Create your own workspace to collaborate with your team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-4 p-6 bg-stone-800 rounded-lg text-center">
                <Building2 className="h-12 w-12 text-primary" />
                <p className="text-lg font-medium">Start collaborating with your team</p>
                <p className="text-muted-foreground max-w-sm">
                  Create a workspace to share updates, track tasks, and collaborate with your team members.
                </p>
                <Button className="mt-2" asChild>
                  <Link href="/create-workspace">
                    <Plus className="mr-2 h-4 w-4" />
                    Create a Workspace
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitations">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Invitations</CardTitle>
              <CardDescription>
                Accept invitations to join existing workspaces
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : pendingInvitations.length > 0 ? (
                <div className="space-y-4">
                  {pendingInvitations.map((invitation: any) => (
                    <div key={invitation.id} className="p-4 border rounded-lg flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{invitation.workspace?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Invited by {invitation.invitedBy?.name || invitation.invitedBy?.email}
                        </p>
                      </div>
                      <Button asChild>
                        <Link href={`/workspace-invitation/${invitation.token}`}>
                          Accept
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 p-6 bg-stone-800 rounded-lg text-center">
                  <Mail className="h-12 w-12 text-muted-foreground" />
                  <p className="text-lg font-medium">No pending invitations</p>
                  <p className="text-muted-foreground max-w-sm">
                    You don&apos;t have any pending workspace invitations. Ask a workspace admin to invite you.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 