"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useUpdateUserProfile } from "@/hooks/queries/useUser";
import { useWorkspace } from "@/context/WorkspaceContext";

interface ProfileFormProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: string;
    team?: string | null;
    currentFocus?: string | null;
    expertise: string[] | [];
    slackId?: string | null;
    image?: string | null;
    avatarSkinTone?: number | null;
    avatarEyes?: number | null;
    avatarBrows?: number | null;
    avatarMouth?: number | null;
    avatarNose?: number | null;
    avatarHair?: number | null;
    avatarEyewear?: number | null;
    avatarAccessory?: number | null;
    useCustomAvatar?: boolean;
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const { toast } = useToast();
  const { currentWorkspace } = useWorkspace();
  const [formData, setFormData] = useState({
    name: user.name || "",
    team: user.team || "",
    currentFocus: user.currentFocus || "",
    expertise: user.expertise?.length ? user.expertise.join(", ") : "",
    slackId: user.slackId || "",
  });

  // Use TanStack Query mutations
  const updateProfileMutation = useUpdateUserProfile(currentWorkspace?.id);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Convert expertise string to array
      const expertiseArray = formData.expertise
        ? formData.expertise.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

      await updateProfileMutation.mutateAsync({
        ...formData,
        expertise: expertiseArray,
      });

      toast({
        title: "Success",
        description: "Your profile has been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
      console.error(error);
    }
  };

  return (
    <Card className="border-border/40 bg-card/95 shadow-lg">
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>
          Update your profile information and notification preferences
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Avatar Section */}
        <div className="flex flex-col items-center mb-8 sm:flex-row sm:items-start sm:space-x-6">
          <div className="mb-4 sm:mb-0">
            {user.useCustomAvatar ? (
              <CustomAvatar user={user} size="xl" className="border-4 border-primary/20 shadow-lg" />
            ) : (
              <Avatar className="h-24 w-24 border-4 border-primary/20 shadow-lg">
                <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                  {user.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg font-medium">{user.name || "Your Name"}</h3>
            <p className="text-muted-foreground">{user.role || "Developer"}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Display Name</Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Your display name"
              className="bg-background border-border/60 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              value={user.email || ""}
              disabled
              className="bg-muted/50 text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed. Contact admin for email updates.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team">Team</Label>
            <Input
              id="team"
              name="team"
              value={formData.team}
              onChange={handleChange}
              placeholder="Your team (e.g., Frontend, Backend, DevOps)"
              className="bg-background border-border/60 focus:border-primary focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currentFocus">Current Focus</Label>
            <Textarea
              id="currentFocus"
              name="currentFocus"
              value={formData.currentFocus}
              onChange={handleChange}
              placeholder="What are you currently working on?"
              rows={3}
              className="bg-background border-border/60 focus:border-primary focus:ring-primary resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expertise">Areas of Expertise</Label>
            <Input
              id="expertise"
              name="expertise"
              value={formData.expertise}
              onChange={handleChange}
              placeholder="Comma-separated list (e.g., React, Node.js, AWS)"
              className="bg-background border-border/60 focus:border-primary focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Separate multiple areas with commas
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="slackId">
              Slack ID <span className="text-muted-foreground">(for notifications)</span>
            </Label>
            <Input
              id="slackId"
              name="slackId"
              value={formData.slackId}
              onChange={handleChange}
              placeholder="Your Slack user ID for notifications"
              className="bg-background border-border/60 focus:border-primary focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              You&apos;ll receive a Slack notification when someone comments on your posts
            </p>
          </div>

          <CardFooter className="px-0 pb-0 pt-6 flex justify-end">
            <Button 
              type="submit" 
              disabled={updateProfileMutation.isPending}
              className="w-full sm:w-auto"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
} 