'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { getScopeDescription, normalizeScopes } from '@/lib/oauth-scopes';
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
  const scope = searchParams.get('scope') || '';
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const preselectedWorkspaceId = searchParams.get('workspace_id');
  const endpoint = searchParams.get('endpoint') === 'regular' ? '/api/oauth/authorize' : '/api/oauth/mcp/authorize';
  const installationId = searchParams.get('installation_id');
  const [prepared, setPrepared] = useState<{ consent_token: string; appName: string; scope: string; redirect_uri: string; state: string | null; params: Record<string, string> } | null>(null);

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

  // Only the server's validated request is displayed and approved. Changing any
  // field invalidates the pending approval and requires a new user click.
  useEffect(() => {
    setPrepared(null);
    if (!selectedWorkspace || !clientId || !redirectUri || status !== 'authenticated') return;
    const controller = new AbortController();
    const params: Record<string, string> = { client_id: clientId, redirect_uri: redirectUri,
      response_type: 'code', scope, workspace_id: selectedWorkspace.id };
    if (state) params.state = state;
    if (installationId) params.installation_id = installationId;
    if (codeChallenge) params.code_challenge = codeChallenge;
    if (codeChallengeMethod) params.code_challenge_method = codeChallengeMethod;
    fetch(`${endpoint}?${new URLSearchParams(params)}`, {
      headers: { 'x-collab-consent': 'prepare' }, cache: 'no-store', signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || 'Cannot authorize this request');
      if (!controller.signal.aborted) {
        setError(null);
        setPrepared({ ...data, params: { ...params, scope: data.scope, redirect_uri: data.redirect_uri } });
      }
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [selectedWorkspace, clientId, redirectUri, status, scope, state, installationId, codeChallenge, codeChallengeMethod, endpoint]);

  async function handleAuthorize() {
    if (!prepared) return;
    setIsAuthorizing(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prepared.params, consent_token: prepared.consent_token, approve: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error_description || 'Authorization failed');
      window.location.href = data.redirect;
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
      setIsAuthorizing(false);
    }
  }

  function handleDeny() {
    if (!prepared) {
      router.push('/');
      return;
    }
    const callback = new URL(prepared.redirect_uri);
    callback.searchParams.set('error', 'access_denied');
    callback.searchParams.delete('state');
    if (prepared.state) callback.searchParams.set('state', prepared.state);
    window.location.href = callback.toString();
  }

  async function handleSignIn() {
    try {
      const response = await fetch('/api/auth/mode', { cache: 'no-store' });
      const configuration = await response.json();
      if (!response.ok || configuration.authMode !== 'nextauth') {
        throw new Error('Sign in is unavailable. Ask your administrator to check your account access.');
      }
      await signIn(undefined, { callbackUrl: window.location.href });
    } catch {
      setError('Sign in is unavailable. Ask your administrator to check your account access.');
    }
  }

  // Show login if not authenticated
  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-collab-950">
        <div className="w-full max-w-md px-8">
          <div className="flex flex-col items-center justify-center text-center mb-8">
            <Link href="/" className="mb-4">
              <Image unoptimized src="/logo-text.svg" width={125} height={125} alt="Collab" />
            </Link>
            <p className="mt-2 text-gray-400">Sign in to connect your workspace</p>
          </div>

          <Card className="bg-collab-900 border-collab-700">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 bg-collab-700 rounded-xl flex items-center justify-center">
                <Terminal className="w-6 h-6 text-green-500" />
              </div>
              <CardTitle className="text-white">Connect to Collab</CardTitle>
              <CardDescription className="text-gray-400">
                Sign in to authorize access to your workspace
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
              <Button
                onClick={handleSignIn}
                className="w-full bg-green-500 hover:bg-green-500/90 text-black font-medium"
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-collab-950">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
        <p className="mt-4 text-gray-400">Loading...</p>
      </div>
    );
  }

  // Validation errors
  if (!clientId || !redirectUri) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-collab-950">
        <Card className="bg-collab-900 border-collab-700 max-w-md">
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

  // Main authorization UI
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-collab-950">
      <div className="w-full max-w-md px-8">
        <div className="flex flex-col items-center justify-center text-center mb-8">
          <Link href="/" className="mb-4">
            <Image unoptimized src="/logo-text.svg" width={125} height={125} alt="Collab" />
          </Link>
        </div>

        <Card className="bg-collab-900 border-collab-700">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-12 h-12 bg-collab-700 rounded-xl flex items-center justify-center">
              <Terminal className="w-6 h-6 text-green-500" />
            </div>
            <CardTitle className="text-white">Authorize {prepared?.appName || (clientId === 'collab-cli' ? 'Collab CLI' : 'application')}</CardTitle>
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
                  <Link href="/welcome" className="text-green-500 hover:underline">
                    Create one
                  </Link>
                </p>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-between bg-collab-700 border-collab-600 text-white hover:bg-collab-600"
                    >
                      {selectedWorkspace?.name || 'Select a workspace'}
                      <ChevronDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-full min-w-[300px] bg-collab-700 border-collab-600">
                    {workspaces.map((workspace) => (
                      <DropdownMenuItem
                        key={workspace.id}
                        onClick={() => setSelectedWorkspace(workspace)}
                        className="text-white hover:bg-collab-600 cursor-pointer"
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
              <div className="p-3 bg-collab-700 rounded-lg space-y-2">
                {normalizeScopes(prepared?.scope || scope).map(getScopeDescription).map(permission => (
                  <div key={permission} className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>{permission}</span>
                  </div>
                ))}
              </div>
            </div>

            {prepared && <p className="break-all text-xs text-gray-400">Return to: {prepared.redirect_uri}</p>}
            {/* Signed in as */}
            <div className="text-center text-sm text-gray-500">
              Signed in as <span className="text-gray-300">{session?.user?.email}</span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleDeny}
                className="flex-1 bg-transparent border-collab-600 text-gray-300 hover:bg-collab-700"
                disabled={isAuthorizing}
              >
                Deny
              </Button>
              <Button
                onClick={handleAuthorize}
                disabled={!prepared || isAuthorizing}
                className="flex-1 bg-green-500 hover:bg-green-500/90 text-black font-medium"
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
