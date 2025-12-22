import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Database, Shield, Bell, Palette } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Platform Settings</h2>
        <p className="text-gray-400">
          Configure system-wide settings and preferences.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-[#22c55e]" />
              <CardTitle className="text-white">Database</CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              Database connection and maintenance settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#1f1f1f]">
                <div>
                  <p className="font-medium text-white">Connection Status</p>
                  <p className="text-sm text-gray-500">PostgreSQL via Prisma</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
                  <span className="text-sm text-[#22c55e]">Connected</span>
                </div>
              </div>
              <Button variant="outline" className="w-full border-[#1f1f1f] text-gray-300 hover:text-white hover:bg-[#1f1f1f]" disabled>
                Run Migrations
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#22c55e]" />
              <CardTitle className="text-white">Security</CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              Authentication and security configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#1f1f1f]">
                <div>
                  <p className="font-medium text-white">OAuth Providers</p>
                  <p className="text-sm text-gray-500">NextAuth.js configuration</p>
                </div>
                <span className="text-sm text-gray-400">Configured</span>
              </div>
              <Button variant="outline" className="w-full border-[#1f1f1f] text-gray-300 hover:text-white hover:bg-[#1f1f1f]" disabled>
                Manage Providers
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-[#22c55e]" />
              <CardTitle className="text-white">Notifications</CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              Email and push notification settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#1f1f1f]">
                <div>
                  <p className="font-medium text-white">Email Provider</p>
                  <p className="text-sm text-gray-500">SMTP configuration</p>
                </div>
                <span className="text-sm text-gray-400">Not configured</span>
              </div>
              <Button variant="outline" className="w-full border-[#1f1f1f] text-gray-300 hover:text-white hover:bg-[#1f1f1f]" disabled>
                Configure Email
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-[#22c55e]" />
              <CardTitle className="text-white">Appearance</CardTitle>
            </div>
            <CardDescription className="text-gray-500">
              Branding and theme customization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg border border-[#1f1f1f]">
                <div>
                  <p className="font-medium text-white">Theme</p>
                  <p className="text-sm text-gray-500">Dark mode only</p>
                </div>
                <span className="text-sm text-gray-400">Default</span>
              </div>
              <Button variant="outline" className="w-full border-[#1f1f1f] text-gray-300 hover:text-white hover:bg-[#1f1f1f]" disabled>
                Customize Theme
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#0a0a0a] border-[#1f1f1f]">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-500" />
            <CardTitle className="text-white">Coming Soon</CardTitle>
          </div>
          <CardDescription className="text-gray-500">
            More configuration options will be available in future updates
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-sm">
            Platform settings are currently read-only. Full configuration management is planned for a future release.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
