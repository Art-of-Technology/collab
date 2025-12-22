'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Puzzle, Building2, Activity, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface AdminStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalApps: number;
  systemApps: number;
  totalInstallations: number;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h2>
        <p className="text-gray-400">
          Welcome to the admin dashboard. Here&apos;s what&apos;s happening across the platform.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Total Users</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : stats?.totalUsers || 0}
            </div>
            <p className="text-xs text-gray-500">Registered users</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Workspaces</CardTitle>
            <Building2 className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : stats?.totalWorkspaces || 0}
            </div>
            <p className="text-xs text-gray-500">Active workspaces</p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">Published Apps</CardTitle>
            <Puzzle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : stats?.totalApps || 0}
            </div>
            <p className="text-xs text-gray-500">
              <span className="text-[#22c55e]">{stats?.systemApps || 0}</span> system apps
            </p>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-400">App Installations</CardTitle>
            <Activity className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">
              {loading ? '...' : stats?.totalInstallations || 0}
            </div>
            <p className="text-xs text-gray-500">Active installations</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
        <CardHeader>
          <CardTitle className="text-white">Quick Actions</CardTitle>
          <CardDescription className="text-gray-500">Common administrative tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/admin/system-apps"
              className="group flex items-center justify-between p-4 rounded-lg border border-[#1f1f1f] hover:bg-[#1f1f1f]/50 hover:border-[#22c55e]/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
                  <Puzzle className="h-5 w-5 text-[#22c55e]" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Manage System Apps</h3>
                  <p className="text-sm text-gray-500">
                    Configure apps for all workspaces
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-[#22c55e] transition-colors" />
            </Link>

            <Link
              href="/dev/manage"
              className="group flex items-center justify-between p-4 rounded-lg border border-[#1f1f1f] hover:bg-[#1f1f1f]/50 hover:border-[#22c55e]/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
                  <Activity className="h-5 w-5 text-[#22c55e]" />
                </div>
                <div>
                  <h3 className="font-medium text-white">Review App Submissions</h3>
                  <p className="text-sm text-gray-500">
                    Approve or reject pending apps
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-[#22c55e] transition-colors" />
            </Link>

            <Link
              href="/admin/users"
              className="group flex items-center justify-between p-4 rounded-lg border border-[#1f1f1f] hover:bg-[#1f1f1f]/50 hover:border-[#22c55e]/30 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-[#22c55e]" />
                </div>
                <div>
                  <h3 className="font-medium text-white">User Management</h3>
                  <p className="text-sm text-gray-500">
                    View and manage user accounts
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-[#22c55e] transition-colors" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
