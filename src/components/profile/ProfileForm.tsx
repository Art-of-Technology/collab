"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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
  };
}

export default function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || "",
    team: user.team || "",
    currentFocus: user.currentFocus || "",
    expertise: user.expertise?.length ? user.expertise.join(", ") : "",
    slackId: user.slackId || "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Convert expertise string to array
      const expertiseArray = formData.expertise
        ? formData.expertise.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          expertise: expertiseArray,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      toast({
        title: "Success",
        description: "Your profile has been updated",
      });

      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
      console.error(error);
    } finally {
      setIsSubmitting(false);
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

          <CardFooter className="px-0 pt-4">
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary/90 transition-colors"
            >
              {isSubmitting ? 
                <div className="flex items-center gap-2">
                  <span className="animate-spin">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                  <span>Saving...</span>
                </div>
                : 
                "Save Changes"
              }
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
} 