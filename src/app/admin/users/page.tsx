import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { systemAdminId } from '@/lib/system-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Shield, UserCheck } from 'lucide-react';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

async function getUsers(search: string) {
  const users = await prisma.user.findMany({
    where: search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ],
    } : undefined,
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

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  // The admin layout only redirects in the browser; without this the list is sent to anyone who asks.
  if (!await systemAdminId()) notFound();
  const { q } = await searchParams;
  const search = typeof q === 'string' ? q.trim() : '';
  const [users, totalCount, adminCount] = await Promise.all([
    getUsers(search),
    prisma.user.count(),
    prisma.user.count({ where: { role: 'SYSTEM_ADMIN' } }),
  ]);

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
            <div className="text-2xl font-bold text-white">{totalCount}</div>
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
            <div className="text-2xl font-bold text-white">{totalCount - adminCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Users List */}
      <Card className="bg-collab-950 border-collab-700">
        <CardHeader>
          <CardTitle className="text-white">All Users</CardTitle>
          <CardDescription className="text-gray-500">
            {search ? `Up to 50 users whose name or email contains "${search}"` : 'Recently registered users on the platform'}. Open a user to manage their workspaces.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/admin/users" className="mb-4 flex gap-2">
            <Input name="q" defaultValue={search} placeholder="Search by name or email" aria-label="Search users" className="max-w-sm border-collab-700 bg-collab-950 text-white" />
            <Button type="submit" variant="outline" size="sm">Search</Button>
          </form>
          <div className="space-y-2">
            {users.map((user) => (
              <Link
                key={user.id}
                href={`/admin/users/${user.id}`}
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
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
