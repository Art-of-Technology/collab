"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { MultiStepLoader } from "@/components/ui/multi-step-loader";
import { Sparkles, ArrowRight, Users, FolderOpen, Layout } from "lucide-react";
import { createPersonalWorkspaceForUser } from "@/lib/onboarding-helpers";
import { toast } from "react-hot-toast";
import Image from "next/image";

interface StreamlinedWelcomeClientProps {
  initialInvitations: any[];
}

// Loading states for workspace creation
const WORKSPACE_CREATION_STEPS = [
  { text: "Setting up your personal workspace..." },
  { text: "Creating your default project..." },
  { text: "Configuring project statuses..." },
  { text: "Setting up your Kanban view..." },
  { text: "Adding your welcome task..." },
  { text: "Finalizing your workspace..." }
];

export default function StreamlinedWelcomeClient({ initialInvitations }: StreamlinedWelcomeClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const handleCreateWorkspace = async () => {
    if (!session?.user?.id) {
      toast.error("Session not found. Please sign in again.");
      return;
    }

    setIsCreatingWorkspace(true);

    try {
      // Create the personal workspace
      const result = await fetch('/api/create-personal-workspace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: session.user.id,
          userName: session.user.name || 'User'
        })
      });

      if (!result.ok) {
        const errorData = await result.json().catch(() => ({ error: 'Unknown error' }));
        
        // Handle specific error cases
        if (result.status === 409) {
          // Workspace already exists - redirect to home page to find existing workspace
          toast.success("🎉 You already have a workspace! Redirecting...");
          setTimeout(() => {
            router.push("/");
            router.refresh();
          }, 1500);
          return;
        }
        
        throw new Error(errorData.error || 'Failed to create workspace');
      }

      const data = await result.json();
      
      // Success! Redirect to home page which will route to workspace
      toast.success("🎉 Your workspace is ready!");
      
      // Add a longer delay to ensure workspace is fully created and propagated
      setTimeout(() => {
        // Force a hard refresh to ensure all data is fresh
        window.location.href = "/";
      }, 2000);
      
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast.error("Failed to create workspace. Please try again.");
      setIsCreatingWorkspace(false);
    }
  };

  return (
    <>
      {/* Multi-step loader overlay */}
      <MultiStepLoader
        loadingStates={WORKSPACE_CREATION_STEPS}
        loading={isCreatingWorkspace}
        duration={1200}
        loop={false}
      />

      {/* Minimal Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-6 bg-background/80 backdrop-blur-sm border-b border-border/20">
        <div className="flex items-center">
          <Image 
            src="/logo-v2.png" 
            alt="Collab" 
            width={32} 
            height={32} 
            className="h-8 w-8"
          />
          <span className="ml-2 text-lg font-semibold text-foreground">collab</span>
        </div>
        
        {session?.user?.image && (
          <div className="flex items-center">
            <Image
              src={session.user.image}
              alt={session.user.name || 'User'}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full border border-border/20"
            />
          </div>
        )}
      </header>

      {/* Main welcome content */}
      <div className="min-h-screen bg-background flex items-center justify-center p-4 pt-20">
        <div className="w-full max-w-2xl mx-auto">
          
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              Welcome to Collab
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Let's set up your personal workspace so you can start organizing and collaborating.
            </p>
          </div>

          {/* Main CTA Card */}
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl blur opacity-50 group-hover:opacity-100 transition duration-300"></div>
            
            <div className="relative bg-card border border-border/40 rounded-2xl p-8 backdrop-blur-sm">
              <div className="text-center space-y-6">
                
                {/* Features preview */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                  <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-muted/30 border border-border/20">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm font-medium">Project</div>
                    <div className="text-xs text-muted-foreground text-center">Organize your work</div>
                  </div>
                  
                  <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-muted/30 border border-border/20">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Layout className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm font-medium">Kanban View</div>
                    <div className="text-xs text-muted-foreground text-center">Visual workflow</div>
                  </div>
                  
                  <div className="flex flex-col items-center space-y-2 p-4 rounded-xl bg-muted/30 border border-border/20">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-sm font-medium">Collaboration</div>
                    <div className="text-xs text-muted-foreground text-center">Ready to scale</div>
                  </div>
                </div>

                {/* Main CTA */}
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold">Ready to get started?</h3>
                  <p className="text-muted-foreground">
                    We'll create your personal workspace with a default project and Kanban view.
                  </p>
                  
                  <Button 
                    onClick={handleCreateWorkspace}
                    disabled={isCreatingWorkspace}
                    size="lg"
                    className="w-full sm:w-auto px-8 py-3 text-base font-medium rounded-xl bg-primary hover:bg-primary/90 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {isCreatingWorkspace ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>Setting up...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-5 h-5" />
                        <span>Let's Start</span>
                        <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                      </div>
                    )}
                  </Button>
                </div>

                {/* Invitations section (if any) */}
                {initialInvitations.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-border/40">
                    <div className="text-sm text-muted-foreground mb-3">
                      You also have {initialInvitations.length} pending invitation{initialInvitations.length !== 1 ? 's' : ''}
                    </div>
                    <div className="space-y-2">
                      {initialInvitations.slice(0, 2).map((invitation) => (
                        <div key={invitation.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/20">
                          <div className="text-sm">
                            <div className="font-medium">{invitation.workspace?.name}</div>
                            <div className="text-muted-foreground text-xs">
                              From {invitation.invitedBy?.name || invitation.invitedBy?.email}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/workspace-invitation/${invitation.token}`)}
                            className="text-xs"
                          >
                            View
                          </Button>
                        </div>
                      ))}
                      
                      {initialInvitations.length > 2 && (
                        <div className="text-center pt-2">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => router.push('/invitations')}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            View all {initialInvitations.length} invitations
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="text-center mt-8">
            <p className="text-sm text-muted-foreground">
              You can always create additional workspaces or invite team members later.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
