import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function TagsPage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Get all tags and count of posts for each tag
  const tagsWithCount = await prisma.tag.findMany({
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
  
  // Group tags by first letter for better UI organization
  const groupedTags: Record<string, typeof tagsWithCount> = {};
  
  tagsWithCount.forEach(tag => {
    const firstLetter = tag.name.charAt(0).toUpperCase();
    if (!groupedTags[firstLetter]) {
      groupedTags[firstLetter] = [];
    }
    groupedTags[firstLetter].push(tag);
  });
  
  // Sort the keys alphabetically
  const sortedLetters = Object.keys(groupedTags).sort();
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-muted-foreground">
          Browse posts by topic
        </p>
      </div>
      
      {tagsWithCount.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No tags have been created yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedLetters.map(letter => (
            <div key={letter} className="space-y-2">
              <h2 className="text-xl font-semibold border-b pb-2">{letter}</h2>
              <div className="flex flex-wrap gap-3">
                {groupedTags[letter].map(tag => (
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
          ))}
        </div>
      )}
    </div>
  );
} 