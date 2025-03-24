import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { MagnifyingGlassIcon, TagIcon, UserIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PostList from "@/components/posts/PostList";

interface SearchPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';
  const activeTab = typeof searchParams.tab === 'string' ? searchParams.tab : 'all';
  
  if (!query) {
    redirect("/timeline");
  }
  
  // Search for posts
  const posts = await prisma.post.findMany({
    where: {
      OR: [
        { message: { contains: query, mode: 'insensitive' } },
        { tags: { some: { name: { contains: query, mode: 'insensitive' } } } }
      ]
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      author: true,
      tags: true,
      comments: {
        include: {
          author: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      reactions: true,
    },
  });
  
  // Search for users
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { role: { contains: query, mode: 'insensitive' } },
        { team: { contains: query, mode: 'insensitive' } }
      ]
    },
    orderBy: {
      name: 'asc'
    },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
      team: true,
      _count: {
        select: {
          posts: true
        }
      }
    }
  });
  
  // Search for tags
  const tags = await prisma.tag.findMany({
    where: {
      name: { contains: query, mode: 'insensitive' }
    },
    include: {
      _count: {
        select: {
          posts: true
        }
      }
    },
    orderBy: {
      name: 'asc'
    }
  });
  
  const totalResults = posts.length + users.length + tags.length;
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Search Results</h1>
        <p className="text-muted-foreground">
          Found {totalResults} results for "{query}"
        </p>
      </div>
      
      <Tabs defaultValue={activeTab} className="mb-8">
        <TabsList className="bg-card/80 border border-border/40 mb-6">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            All Results ({totalResults})
          </TabsTrigger>
          <TabsTrigger value="posts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Posts ({posts.length})
          </TabsTrigger>
          <TabsTrigger value="people" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            People ({users.length})
          </TabsTrigger>
          <TabsTrigger value="tags" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Tags ({tags.length})
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="all" className="space-y-8">
          {/* Posts Section */}
          {posts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <MagnifyingGlassIcon className="h-5 w-5" />
                  Posts
                </h2>
                {posts.length > 3 && (
                  <Link 
                    href={`/search?q=${encodeURIComponent(query)}&tab=posts`}
                    className="text-sm text-primary hover:underline"
                  >
                    See all {posts.length} posts
                  </Link>
                )}
              </div>
              <PostList posts={posts.slice(0, 3)} currentUserId={user.id} />
            </div>
          )}
          
          {/* Users Section */}
          {users.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  People
                </h2>
                {users.length > 3 && (
                  <Link 
                    href={`/search?q=${encodeURIComponent(query)}&tab=people`} 
                    className="text-sm text-primary hover:underline"
                  >
                    See all {users.length} people
                  </Link>
                )}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {users.slice(0, 4).map(user => (
                  <Card key={user.id} className="overflow-hidden hover:shadow-md transition-shadow border-border/40 bg-card/95">
                    <Link href={`/profile/${user.id}`} className="block p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border-2 border-primary/10">
                          <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {user.name?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{user.name}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {user.role && (
                              <Badge variant="secondary" className="text-xs px-2 py-0 font-normal">
                                {user.role}
                              </Badge>
                            )}
                            {user.team && (
                              <Badge variant="outline" className="text-xs px-2 py-0 font-normal">
                                {user.team}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">{user._count.posts} posts</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </Card>
                ))}
              </div>
            </div>
          )}
          
          {/* Tags Section */}
          {tags.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <TagIcon className="h-5 w-5" />
                  Tags
                </h2>
                {tags.length > 8 && (
                  <Link 
                    href={`/search?q=${encodeURIComponent(query)}&tab=tags`} 
                    className="text-sm text-primary hover:underline"
                  >
                    See all {tags.length} tags
                  </Link>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {tags.slice(0, 12).map(tag => (
                  <Link 
                    key={tag.id} 
                    href={`/timeline?tag=${encodeURIComponent(tag.name)}`}
                    className="no-underline"
                  >
                    <Badge variant="outline" className="text-sm px-3 py-1 hover:bg-secondary transition-colors whitespace-nowrap">
                      #{tag.name}
                      <span className="ml-2 bg-muted-foreground/20 rounded-full px-2 py-0.5 text-xs">
                        {tag._count.posts}
                      </span>
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
          
          {totalResults === 0 && (
            <Card className="border-border/40 bg-card/95 shadow-md">
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>No results found for "{query}"</p>
                <p className="text-sm mt-1">Try searching for something else or check your spelling</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="posts">
          {posts.length > 0 ? (
            <PostList posts={posts} currentUserId={user.id} />
          ) : (
            <Card className="border-border/40 bg-card/95 shadow-md">
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>No posts found for "{query}"</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="people">
          {users.length > 0 ? (
            <div className="grid md:grid-cols-2 gap-4">
              {users.map(user => (
                <Card key={user.id} className="overflow-hidden hover:shadow-md transition-shadow border-border/40 bg-card/95">
                  <Link href={`/profile/${user.id}`} className="block p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border-2 border-primary/10">
                        <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.name?.charAt(0).toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {user.role && (
                            <Badge variant="secondary" className="text-xs px-2 py-0 font-normal">
                              {user.role}
                            </Badge>
                          )}
                          {user.team && (
                            <Badge variant="outline" className="text-xs px-2 py-0 font-normal">
                              {user.team}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{user._count.posts} posts</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-border/40 bg-card/95 shadow-md">
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>No people found for "{query}"</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="tags">
          {tags.length > 0 ? (
            <Card className="border-border/40 bg-card/95 shadow-md">
              <CardContent className="p-6">
                <div className="flex flex-wrap gap-3">
                  {tags.map(tag => (
                    <Link 
                      key={tag.id} 
                      href={`/timeline?tag=${encodeURIComponent(tag.name)}`}
                      className="no-underline"
                    >
                      <Badge variant="outline" className="text-sm px-3 py-1 hover:bg-secondary transition-colors whitespace-nowrap">
                        #{tag.name}
                        <span className="ml-2 bg-muted-foreground/20 rounded-full px-2 py-0.5 text-xs">
                          {tag._count.posts}
                        </span>
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/40 bg-card/95 shadow-md">
              <CardContent className="p-8 text-center text-muted-foreground">
                <p>No tags found for "{query}"</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 