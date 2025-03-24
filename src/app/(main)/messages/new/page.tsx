import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon, ArrowLeftIcon } from "@heroicons/react/24/outline";

export default async function NewMessagePage() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect("/login");
  }
  
  // Get all users except the current user
  const users = await prisma.user.findMany({
    where: {
      id: {
        not: user.id
      }
    },
    orderBy: {
      name: 'asc'
    },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
      team: true
    }
  });
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 overflow-x-hidden">
      <div className="flex items-center gap-4 mb-6">
        <Button asChild variant="ghost" size="icon">
          <Link href="/messages">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Message</h1>
      </div>
      
      <Card>
        <CardHeader className="p-4 space-y-2 border-b">
          <h2 className="text-lg font-semibold">Select a person to message</h2>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              type="search"
              placeholder="Search by name or team..."
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y max-h-[60vh] overflow-y-auto">
          {users.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              No users found
            </div>
          ) : (
            users.map((userItem) => (
              <Link
                key={userItem.id}
                href={`/messages/new/${userItem.id}`}
                className="flex items-center gap-3 p-4 hover:bg-muted transition-colors"
              >
                <Avatar>
                  <AvatarImage src={userItem.image || undefined} alt={userItem.name || "User"} />
                  <AvatarFallback>
                    {userItem.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{userItem.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {userItem.role}
                    {userItem.team && ` · ${userItem.team}`}
                  </p>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
} 