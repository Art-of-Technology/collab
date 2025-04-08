'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useUsersForNewConversation, useCreateConversation } from '@/hooks/queries/useMessage';

interface User {
  id: string;
  name: string | null;
  image: string | null;
  role: string | null;
  team: string | null;
}

interface NewMessageUIProps {
  initialUsers: User[];
}

export default function NewMessageUI({ initialUsers }: NewMessageUIProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();
  const createConversation = useCreateConversation();
  
  // Use TanStack Query with initialData
  const { data: users = initialUsers } = useUsersForNewConversation();
  
  // Filter users by search query
  const filteredUsers = users.filter(user => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    return (
      user.name?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query) ||
      user.team?.toLowerCase().includes(query)
    );
  });
  
  const handleUserClick = async (userId: string) => {
    try {
      const conversationId = await createConversation.mutateAsync(userId);
      router.push(`/messages/${conversationId}`);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };
  
  return (
    <Card>
      <CardHeader className="p-4 space-y-2 border-b">
        <h2 className="text-lg font-semibold">Select a person to message</h2>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            type="search"
            placeholder="Search by name or team..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 divide-y max-h-[60vh] overflow-y-auto">
        {filteredUsers.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            No users found
          </div>
        ) : (
          filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => handleUserClick(user.id)}
              className="w-full text-left"
            >
              <div className="flex items-center gap-3 p-4 hover:bg-muted transition-colors">
                <Avatar>
                  <AvatarImage src={user.image || undefined} alt={user.name || "User"} />
                  <AvatarFallback>
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {user.role}
                    {user.team && ` · ${user.team}`}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
} 