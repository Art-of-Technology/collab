"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useCreateFeatureRequest } from "@/hooks/queries/useFeature";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function CreateFeatureRequestButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  const createFeature = useCreateFeatureRequest();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim() || !description.trim()) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    const formData = new FormData();
    formData.append("title", title);
    formData.append("description", description);
    
    try {
      createFeature.mutate(formData, {
        onSuccess: () => {
          toast({
            title: "Feature request submitted",
            description: "Your feature request has been submitted successfully",
          });
          setTitle("");
          setDescription("");
          setOpen(false);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to submit your feature request",
            variant: "destructive",
          });
        }
      });
    } catch (error) {
      console.error("Error submitting feature request:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New Feature Request
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Feature Request</DialogTitle>
            <DialogDescription>
              Suggest a new feature or improvement. Be descriptive so others understand your idea.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief title for your feature idea"
                className="col-span-3"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your feature idea in detail. What problem does it solve? How should it work?"
                className="col-span-3 h-32"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="submit" 
              disabled={createFeature.isPending}
              className="w-full sm:w-auto"
            >
              {createFeature.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Feature Request"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 