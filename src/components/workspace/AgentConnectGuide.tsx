'use client';

import { useState } from 'react';
import { Check, Copy, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface AgentConnectGuideProps {
  /** The MCP endpoint of this deployment; null while its public origin is not configured. */
  mcpUrl: string | null;
}

export default function AgentConnectGuide({ mcpUrl }: AgentConnectGuideProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState('');

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
    } catch {
      toast({ title: 'Error', description: 'Could not copy. Select the text and copy it by hand.', variant: 'destructive' });
    }
  };

  const snippet = (label: string, text: string) => (
    <div className="flex items-start gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border/40 bg-muted/40 p-2 font-mono text-xs"><code>{text}</code></pre>
      <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => copy(text)}>
        {copied === text ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
        {copied === text ? 'Copied' : 'Copy'}
        <span className="sr-only"> {label}</span>
      </Button>
    </div>
  );

  return (
    <Card className="border border-border/40 bg-card/50">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-medium">Connect an agent</CardTitle>
        </div>
        <CardDescription className="text-xs">
          An agent on another platform reads and writes issues, comments and Notes through Collab&apos;s MCP endpoint. It can do what its sign-in or its token allows.
        </CardDescription>
      </CardHeader>
      {mcpUrl ? (
        <CardContent className="space-y-5 px-4 pb-4 text-sm">
          <section className="space-y-2">
            <h2 className="font-medium">Endpoint</h2>
            {snippet('the endpoint URL', mcpUrl)}
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Claude Code, as yourself</h2>
            <p className="text-muted-foreground">Each person runs this command in each project where they want to use Collab, then signs in with their own account.</p>
            {/* Double quotes: an IPv6 origin's brackets are a pattern in zsh, and Command Prompt passes single quotes through. */}
            {snippet('the Claude Code command', `claude mcp add --transport http --client-id collab-connector collab "${mcpUrl}"`)}
            <p className="text-muted-foreground">Then run <code>/mcp</code> in Claude Code and sign in.</p>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">An agent with its own name</h2>
            <p className="text-muted-foreground">
              Create a token on this page and give it to the agent as the <code>COLLAB_TOKEN</code> environment variable. Everything the agent writes shows the token&apos;s name.
            </p>
            <p className="text-muted-foreground">
              For Claude Code, add this to the project&apos;s <code>.mcp.json</code>. It reads the token from the environment, so no file holds the secret:
            </p>
            {snippet('the .mcp.json entry', JSON.stringify({ mcpServers: { collab: { type: 'http', url: mcpUrl, headers: { Authorization: 'Bearer ${COLLAB_TOKEN}' } } } }, null, 2))}
            <p className="text-muted-foreground">
              Any other MCP client takes the same URL and an <code>Authorization: Bearer</code> header with the token.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">claude.ai, each member as themselves</h2>
            <p className="text-muted-foreground">
              An organisation owner adds a custom connector with the endpoint above, chooses sign-in with &ldquo;Use your own OAuth client&rdquo;, and enters the client ID <code>collab-connector</code> with no secret. Each member then connects it and signs in to Collab.
            </p>
          </section>

          <p className="text-xs text-muted-foreground">
            Claude in Slack, the list of tools and the limits are in the{' '}
            <a className="underline" href="https://github.com/Art-of-Technology/collab/blob/main/docs/mcp-remote.md" target="_blank" rel="noopener noreferrer">MCP guide</a>.
          </p>
        </CardContent>
      ) : (
        <CardContent className="px-4 pb-4 text-sm text-muted-foreground">
          This deployment has no public address configured (<code>NEXTAUTH_URL</code>), so its endpoint cannot be shown here.
        </CardContent>
      )}
    </Card>
  );
}
