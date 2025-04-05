"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useCreateConversation, useSendMessage } from "@/hooks/queries/useMessage";

interface User {
  id: string;
  name: string | null;
  image: string | null;
  role?: string | null;
  team?: string | null;
}

interface StartConversationFormProps {
  users?: User[];
  recipient?: User;
}

export default function StartConversationForm({ users = [], recipient }: StartConversationFormProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(recipient || null);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const { toast } = useToast();
  
  // Use TanStack Query mutations
  const createConversationMutation = useCreateConversation();
  const sendMessageMutation = useSendMessage();
  
  // Combined loading state from both mutations
  const isLoading = createConversationMutation.isPending || sendMessageMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedUser || !message.trim()) return;
    
    try {
      // First create the conversation using the mutation
      const conversationId = await createConversationMutation.mutateAsync(selectedUser.id);
      
      // Then send the first message
      await sendMessageMutation.mutateAsync({
        conversationId,
        content: message.trim()
      });
      
      // Navigate to the conversation
      router.push(`/messages/${conversationId}`);
    } catch (error) {
      // Error handling is already done in the mutations
      console.error("Error creating conversation or sending message:", error);
    }
  };

  if (users.length === 0 && !recipient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No users available to message</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center">
        <Button variant="ghost" size="icon" asChild className="mr-2">
          <Link href="/messages">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Message</h1>
      </div>
      
      {!selectedUser ? (
        <Card className="border-border/40 bg-card/95 shadow-lg">
          <CardHeader className="border-b border-border/40 p-4">
            <h2 className="text-lg font-semibold">Select a user to message</h2>
          </CardHeader>
          <CardContent className="p-0 divide-y divide-border/30">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUser(user)}
                className="w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center gap-3"
              >
                <Avatar className="border-2 border-primary/10">
                  <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.role || "Developer"}</p>
                  {user.team && (
                    <p className="text-xs text-muted-foreground">Team: {user.team}</p>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit}>
          <Card className="mb-6 border-border/40 bg-card/95 shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="border-2 border-primary/10">
                  <AvatarImage src={selectedUser.image || undefined} alt={selectedUser.name || "User"} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {selectedUser.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{selectedUser.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.role || "Developer"}</p>
                </div>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedUser(null)}
                  className="ml-auto text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                >
                  Change
                </Button>
              </div>
              
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                className={cn(
                  "resize-none min-h-24 border-border/60 bg-card/60 focus:ring-primary/20",
                  isLoading && "opacity-70"
                )}
                disabled={isLoading}
              />
            </CardContent>
          </Card>
          
          <div className="flex justify-end">
            <Button
              type="button" 
              variant="outline" 
              onClick={() => setSelectedUser(null)}
              disabled={isLoading}
              className="mr-2 border-border/60"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !message.trim()}
              className={cn(
                "transition-all",
                isLoading && "opacity-70"
              )}
            >
              {isLoading ? (
                <>
                  <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Sending...
                </>
              ) : (
                "Send Message"
              )}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
} 