"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Sparkles, Loader2, PlusCircle } from "lucide-react";
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
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const featureRequestFormSchema = z.object({
  title: z
    .string()
    .min(5, { message: "Title must be at least 5 characters." })
    .max(100, { message: "Title must not exceed 100 characters." }),
  description: z
    .string()
    .min(20, { message: "Description must be at least 20 characters." })
    .max(1000, { message: "Description must not exceed 1000 characters." }),
});

type FeatureRequestFormValues = z.infer<typeof featureRequestFormSchema>;

export default function CreateFeatureRequestButton() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FeatureRequestFormValues>({
    resolver: zodResolver(featureRequestFormSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  const onSubmit = async (values: FeatureRequestFormValues) => {
    setIsSubmitting(true);
    console.log("Submitting feature request:", values);

    try {
      const response = await fetch("/api/features", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      console.log("API response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("Error response:", errorData);
        
        // Show specific error message if available
        if (errorData?.error) {
          toast({
            title: "Failed to create feature request",
            description: errorData.error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Failed to create feature request",
            description: `Server responded with status: ${response.status}`,
            variant: "destructive",
          });
        }
        setIsSubmitting(false);
        return;
      }

      const data = await response.json();
      console.log("Feature request created:", data);

      toast({
        title: "Feature request created!",
        description: "Your feature request has been submitted successfully.",
      });

      setIsOpen(false);
      form.reset();
      window.location.reload(); // Refresh to show the new feature request
    } catch (error) {
      console.error("Error submitting feature request:", error);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-primary hover:bg-primary/90 transition-colors">
          <PlusCircle className="h-4 w-4" />
          <span>New Feature Request</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px] bg-card/95 backdrop-blur-sm border-border/40">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Submit a Feature Request
          </DialogTitle>
          <DialogDescription>
            Suggest a new feature or improvement for the platform. Be clear and
            specific about what you&apos;d like to see.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="A short, descriptive title for your feature request" 
                      {...field} 
                      className="bg-background border-border/60 focus:border-primary focus:ring-primary"
                    />
                  </FormControl>
                  <FormDescription>
                    Summarize your request in a clear, concise title.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe your feature request in detail. What problem does it solve? How would it work?" 
                      className="min-h-[150px] resize-none bg-background border-border/60 focus:border-primary focus:ring-primary" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Provide as much detail as possible about how this feature would work and why it&apos;s valuable.
                  </FormDescription>
                  <div className="text-right text-xs text-muted-foreground mt-1">
                    {field.value.length} / 1000 characters
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="border-border/60 hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="bg-primary hover:bg-primary/90 transition-colors"
              >
                {isSubmitting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    <span>Submit Request</span>
                  </div>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 