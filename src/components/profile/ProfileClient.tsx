'use client';

import { useState } from 'react';
import { useInfiniteUserProfilePosts, useCurrentUserProfile } from "@/hooks/queries/useUser";
import ProfileForm from "@/components/profile/ProfileForm";
import { useWorkspace } from "@/context/WorkspaceContext";
import PostList from "@/components/posts/PostList";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import NotificationSettings from "@/components/profile/NotificationSettings";

interface ProfileClientProps {
  initialData: any;
}

export default function ProfileClient({ initialData }: ProfileClientProps) {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || '';
  const [initialWorkspaceId] = useState(() => workspaceId);
  
  const { data: profileData, isLoading: isProfileLoading } = useCurrentUserProfile(workspaceId);
  const { user, stats } = profileData || initialData || {};
  const {
    data: infinitePostsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isPostsLoading
  } = useInfiniteUserProfilePosts(
    workspaceId, 
    10, 
    initialWorkspaceId === workspaceId ? initialData?.posts : undefined
  );

  if ((isProfileLoading && !initialData) || !user || !stats) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  const posts = infinitePostsData?.pages.flatMap((page: any) => {
    if (Array.isArray(page)) {
      return page;
    }
    return page.posts || [];
  }) || initialData?.posts || [];
  
  if (isPostsLoading && !initialData) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  return (
    <div className="max-w-3xl mx-auto px-4 py-6 overflow-x-hidden">
      <Card className="mb-8 border-border/40 bg-card/95 shadow-lg hover:shadow-xl transition-all duration-300">
        <CardHeader className="pb-2">
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
              <h1 className="text-2xl font-bold">{user.name}</h1>
              <p className="text-muted-foreground">{user.role || "Developer"}</p>
            </div>
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
      
      <Tabs defaultValue="profile" className="mb-8">
        <TabsList className="bg-card/80 border border-border/40 flex w-full">
          <TabsTrigger value="profile" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs flex-1 px-2">
            <span className="sm:hidden">Profile</span>
            <span className="hidden sm:inline">Profile Settings</span>
          </TabsTrigger>
          <TabsTrigger value="posts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs flex-1 px-2">
            <span className="sm:hidden">Posts</span>
            <span className="hidden sm:inline">Your Posts</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs flex-1 px-2">
            <span className="sm:hidden">Notifications</span>
            <span className="hidden sm:inline">Notification Settings</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileForm user={{
            ...user,
            expertise: user.expertise || []
          }} />
        </TabsContent>
        <TabsContent value="posts" className="mt-4">
          <div className="overflow-y-auto max-h-[calc(100vh-400px)]">
            {posts.length > 0 ? (
              <PostList 
                posts={posts} 
                currentUserId={user.id}
                hasNextPage={hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                onLoadMore={() => fetchNextPage()}
              />
            ) : (
              <Card className="border-border/40 bg-card/95 shadow-md">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <p>You haven&apos;t created any posts yet.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
} 