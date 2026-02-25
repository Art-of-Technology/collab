import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, UserCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';

async function getUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          workspaceMemberships: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  return users;
}

export default async function AdminUsersPage() {
  const users = await getUsers();
  const adminCount = users.filter(u => u.role === 'SYSTEM_ADMIN').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">User Management</h2>
        <p className="text-gray-400">
          View and manage user accounts across the platform.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-collab-950 border-collab-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Users</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{users.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-collab-950 border-collab-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">System Admins</CardTitle>
            <Shield className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{adminCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-collab-950 border-collab-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Regular Users</CardTitle>
            <UserCheck className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{users.length - adminCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users List */}
      <Card className="bg-collab-950 border-collab-700">
        <CardHeader>
          <CardTitle className="text-white">All Users</CardTitle>
          <CardDescription className="text-gray-500">
            Recently registered users on the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 rounded-lg border border-collab-700 hover:bg-collab-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <UserAvatar user={user} size="lg" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{user.name || 'Unknown'}</span>
                      {user.role === 'SYSTEM_ADMIN' && (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{user.email}</p>
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  <div>{user._count.workspaceMemberships} workspaces</div>
                  <div className="text-xs">
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
