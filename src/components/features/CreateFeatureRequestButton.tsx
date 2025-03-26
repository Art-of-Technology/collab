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
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { useRouter } from "next/navigation";

const formSchema = z.object({
  title: z.string().min(5, {
    message: "Title must be at least 5 characters.",
  }).max(100, {
    message: "Title must not be longer than 100 characters.",
  }),
  description: z.string().min(20, {
    message: "Description must be at least 20 characters.",
  }).max(2000, {
    message: "Description must not be longer than 2000 characters.",
  }),
});

export default function CreateFeatureRequestButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
    },
  });

  const handleEditorChange = (html: string, markdown: string) => {
    setDescriptionHtml(html);
    form.setValue('description', markdown);
  };

  const handleAiImprove = async (text: string): Promise<string> => {
    if (isImproving || !text.trim()) return text;
    
    setIsImproving(true);
    
    try {
      const response = await fetch("/api/ai/improve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        throw new Error("Failed to improve text");
      }
      
      const data = await response.json();
      
      // Extract message from the response
      const improvedText = data.message || data.improvedText || text;
      
      return improvedText;
    } catch (error) {
      console.error("Error improving text:", error);
      toast({
        title: "Error",
        description: "Failed to improve text",
        variant: "destructive"
      });
      return text;
    } finally {
      setIsImproving(false);
    }
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/features', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: values.title,
          description: values.description,
          html: descriptionHtml,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create feature request');
      }
      
      form.reset();
      setDescriptionHtml("");
      setIsOpen(false);
      toast({
        title: 'Success',
        description: 'Your feature request has been submitted.',
      });
      
      router.refresh();
    } catch (error) {
      console.error("Error submitting feature request:", error);
      toast({
        title: 'Error',
        description: 'Failed to create feature request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Request Feature
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Request a New Feature</DialogTitle>
          <DialogDescription>
            Describe the feature you would like to see in our platform.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Feature title" {...field} />
                  </FormControl>
                  <FormDescription>
                    A clear, concise title for your feature request.
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
                    <MarkdownEditor
                      content={field.value}
                      onChange={handleEditorChange}
                      placeholder="Provide a detailed description of the feature..."
                      minHeight="200px"
                      maxHeight="400px"
                      className="min-h-[200px]"
                      onAiImprove={handleAiImprove}
                    />
                  </FormControl>
                  <FormDescription>
                    Explain in detail why this feature would be valuable.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isImproving}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 