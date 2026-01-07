'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { Loader2, CheckCircle2, XCircle, Terminal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

export default function MCPAuthPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth params
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const state = searchParams.get('state');
  const scope = searchParams.get('scope') || 'user:read workspace:read issues:read issues:write';
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const preselectedWorkspaceId = searchParams.get('workspace_id');

  // Validate redirect URI - allow localhost and custom protocols (cursor://, vscode://, etc.)
  const isValidRedirectUri = redirectUri?.startsWith('http://127.0.0.1:') ||
                             redirectUri?.startsWith('http://localhost:') ||
                             (redirectUri && !redirectUri.startsWith('http://') && !redirectUri.startsWith('https://'));

  // Fetch user's workspaces
  useEffect(() => {
    if (status === 'authenticated') {
      fetchWorkspaces();
    } else if (status === 'unauthenticated') {
      setIsLoading(false);
    }
  }, [status]);

  // Pre-select workspace if specified
  useEffect(() => {
    if (preselectedWorkspaceId && workspaces.length > 0) {
      const workspace = workspaces.find(w => w.id === preselectedWorkspaceId);
      if (workspace) {
        setSelectedWorkspace(workspace);
      }
    }
  }, [preselectedWorkspaceId, workspaces]);

  async function fetchWorkspaces() {
    try {
      const response = await fetch('/api/workspaces');
      if (!response.ok) throw new Error('Failed to fetch workspaces');
      const data = await response.json();
      setWorkspaces(data.workspaces || data);

      // Auto-select if only one workspace
      if ((data.workspaces || data).length === 1) {
        setSelectedWorkspace((data.workspaces || data)[0]);
      }
    } catch (err) {
      setError('Failed to load workspaces');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAuthorize() {
    if (!selectedWorkspace || !clientId || !redirectUri) return;

    setIsAuthorizing(true);
    setError(null);

    try {
      // Call the authorize API endpoint
      const authorizeUrl = new URL('/api/oauth/mcp/authorize', window.location.origin);
      authorizeUrl.searchParams.set('client_id', clientId);
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('response_type', 'code');
      authorizeUrl.searchParams.set('scope', scope);
      authorizeUrl.searchParams.set('workspace_id', selectedWorkspace.id);
      if (state) authorizeUrl.searchParams.set('state', state);
      if (codeChallenge) authorizeUrl.searchParams.set('code_challenge', codeChallenge);
      if (codeChallengeMethod) authorizeUrl.searchParams.set('code_challenge_method', codeChallengeMethod);

      // Redirect to authorize endpoint which will handle the code generation
      window.location.href = authorizeUrl.toString();
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
      setIsAuthorizing(false);
    }
  }

  function handleDeny() {
    if (!redirectUri || !state) {
      router.push('/');
      return;
    }

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('error', 'access_denied');
    callbackUrl.searchParams.set('error_description', 'User denied authorization');
    if (state) callbackUrl.searchParams.set('state', state);

    window.location.href = callbackUrl.toString();
  }

  // Show login if not authenticated
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="w-full max-w-md px-8">
          <div className="flex flex-col items-center justify-center text-center mb-8">
            <Link href="/" className="mb-4">
              <Image src="/logo-text.svg" width={125} height={125} alt="Collab" />
            </Link>
            <p className="mt-2 text-gray-400">Sign in to connect your workspace</p>
          </div>

          <Card className="bg-[#111] border-[#222]">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-[#1f1f1f] rounded-xl flex items-center justify-center">
                <Terminal className="w-6 h-6 text-[#22c55e]" />
              </div>
              <CardTitle className="text-white">Connect to Collab MCP</CardTitle>
              <CardDescription className="text-gray-400">
                Sign in to authorize access to your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
                className="w-full bg-[#22c55e] hover:bg-[#22c55e]/90 text-black font-medium"
              >
                Sign in to Continue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading state
  if (status === 'loading' || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 animate-spin text-[#22c55e]" />
        <p className="mt-4 text-gray-400">Loading...</p>
      </div>
    );
  }

  // Validation errors
  if (!clientId || !redirectUri) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
        <Card className="bg-[#111] border-[#222] max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
            <CardTitle className="text-white">Invalid Request</CardTitle>
            <CardDescription className="text-gray-400">
              Missing required parameters (client_id, redirect_uri)
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!isValidRedirectUri) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
        <Card className="bg-[#111] border-[#222] max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
            <CardTitle className="text-white">Invalid Redirect URI</CardTitle>
            <CardDescription className="text-gray-400">
              For security, MCP authorization only supports localhost callbacks.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Main authorization UI
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a]">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <Link href="/" className="mb-4">
            <Image src="/logo-text.svg" width={125} height={125} alt="Collab" />
          </Link>
        </div>

        <Card className="bg-[#111] border-[#222]">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-[#1f1f1f] rounded-xl flex items-center justify-center">
              <Terminal className="w-6 h-6 text-[#22c55e]" />
            </div>
            <CardTitle className="text-white">Authorize Collab MCP</CardTitle>
            <CardDescription className="text-gray-400">
              Connect your AI assistant to Collab
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Workspace selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Workspace</label>
              {workspaces.length === 0 ? (
                <p className="text-sm text-gray-500">
                  You don't have any workspaces.{' '}
                  <Link href="/welcome" className="text-[#22c55e] hover:underline">
                    Create one
                  </Link>
                </p>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between bg-[#1f1f1f] border-[#333] text-white hover:bg-[#2a2a2a]"
                    >
                      {selectedWorkspace?.name || 'Select a workspace'}
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full min-w-[300px] bg-[#1f1f1f] border-[#333]">
                    {workspaces.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.id}
                        onClick={() => setSelectedWorkspace(workspace)}
                        className="text-white hover:bg-[#2a2a2a] cursor-pointer"
                      >
                        <div className="flex flex-col">
                          <span>{workspace.name}</span>
                          <span className="text-xs text-gray-500">/{workspace.slug}</span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Permissions */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Permissions requested</label>
              <div className="p-3 bg-[#1f1f1f] rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                  <span>Read and write issues</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                  <span>Read and write projects</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                  <span>Read workspace information</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                  <span>Read and write comments</span>
                </div>
              </div>
            </div>

            {/* Signed in as */}
            <div className="text-center text-sm text-gray-500">
              Signed in as <span className="text-gray-300">{session?.user?.email}</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleDeny}
                className="flex-1 bg-transparent border-[#333] text-gray-300 hover:bg-[#1f1f1f]"
                disabled={isAuthorizing}
              >
                Deny
              </Button>
              <Button
                onClick={handleAuthorize}
                disabled={!selectedWorkspace || isAuthorizing}
                className="flex-1 bg-[#22c55e] hover:bg-[#22c55e]/90 text-black font-medium"
              >
                {isAuthorizing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authorizing...
                  </>
                ) : (
                  'Authorize'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-gray-500">
          By authorizing, you allow this application to access your Collab workspace.
        </p>
      </div>
    </div>
  );
}
