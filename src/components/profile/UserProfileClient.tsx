'use client';

import { useUserProfile } from "@/hooks/queries/useUser";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import PostList from "@/components/posts/PostList";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";

interface UserProfileClientProps {
  userId: string;
  initialData: any;
}

export default function UserProfileClient({ 
  userId, 
  initialData 
}: UserProfileClientProps) {
  const router = useRouter();
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading, error } = useUserProfile(userId);
  
  // Handle redirect to self profile
  useEffect(() => {
    if (error instanceof Error && error.message === 'self_profile') {
      router.push('/profile');
    }
  }, [error, router]);
  
  // Use the data from query or fall back to initial data
  const { user, posts, stats, existingConversation } = data || initialData;
  
  if (isLoading && !initialData) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="flex items-center gap-2 mb-6">
        <Button asChild variant="ghost" size="icon">
          <Link href={currentWorkspace ? `/${currentWorkspace.id}/timeline` : '#'}>
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-xl font-bold">User Profile</h1>
      </div>
      
      <Card className="mb-8 border-border/40 bg-card/95 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {user.useCustomAvatar ? (
                <CustomAvatar user={user} size="lg" className="border-2 border-primary/20 shadow-md" />
              ) : (
                <Avatar className="h-16 w-16 border-2 border-primary/20 shadow-md">
                  <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              )}
              <div>
                <h2 className="text-2xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground">{user.role || "Developer"}</p>
                {user.team && (
                  <p className="text-sm text-muted-foreground">Team: {user.team}</p>
                )}
              </div>
            </div>
            
            <Button asChild variant="outline">
              <Link href={existingConversation ? `/messages/${existingConversation.id}` : `/messages/new/${user.id}`}>
                Message
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between mt-4 mb-6">
            <div className="text-center p-3 hover:bg-primary/5 rounded-lg transition-colors">
              <p className="text-2xl font-semibold">{stats.postCount}</p>
              <p className="text-muted-foreground text-sm">Posts</p>
            </div>
            <div className="text-center p-3 hover:bg-primary/5 rounded-lg transition-colors">
              <p className="text-2xl font-semibold">{stats.commentCount}</p>
              <p className="text-muted-foreground text-sm">Comments</p>
            </div>
            <div className="text-center p-3 hover:bg-primary/5 rounded-lg transition-colors">
              <p className="text-2xl font-semibold">{stats.reactionsReceived}</p>
              <p className="text-muted-foreground text-sm">Reactions</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-border/40 bg-card/95 shadow-md">
        <CardHeader className="pb-2 border-b border-border/40">
          <h2 className="text-xl font-semibold">{user.name}&apos;s Posts</h2>
        </CardHeader>
        <CardContent className="pt-4">
          {posts.length > 0 ? (
            <PostList posts={posts} currentUserId={initialData.currentUser.id} />
          ) : (
            <div className="p-4 text-center text-muted-foreground">
              <p>This user hasn&apos;t created any posts yet.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 