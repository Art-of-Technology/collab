"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface TokenData {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    workspaces: Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }>;
  };
}

export default function MCPTokenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    // Fetch token data
    const fetchToken = async () => {
      try {
        const response = await fetch("/api/auth/mcp-token");
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate token");
        }
        
        setTokenData(data);
      } catch (err) {
        console.error("Token generation error:", err);
        setError(err instanceof Error ? err.message : "Failed to generate token");
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [status, router]);

  const copyToken = () => {
    if (!tokenData) return;
    
    navigator.clipboard.writeText(tokenData.token).then(() => {
      const btn = document.querySelector('#copyBtn') as HTMLButtonElement;
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = tokenData.token;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      const btn = document.querySelector('#copyBtn') as HTMLButtonElement;
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Generating your MCP token...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-6">
          <h1 className="text-xl font-semibold text-center mb-4 text-destructive">Error</h1>
          <p className="text-center text-muted-foreground">{error}</p>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={() => router.push("/")}>
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-card border border-border rounded-lg p-8">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-2">🔑 MCP Token for Cursor</h1>
          <p className="text-muted-foreground">
            Use this token to authenticate with the Collab MCP server in Cursor
          </p>
        </div>

        {tokenData && (
          <>
            <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6">
              <h3 className="font-semibold mb-2">Authenticated as:</h3>
              <p><strong>Name:</strong> {tokenData.user.name}</p>
              <p><strong>Email:</strong> {tokenData.user.email}</p>
              <p><strong>Workspaces:</strong> {tokenData.user.workspaces.length} workspace(s)</p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <h3 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">📋 Instructions:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>Copy the token below</li>
                <li>Go to your MCP client (Cursor)</li>
                <li>Use the <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">login-with-token</code> tool</li>
                <li>Paste the token when prompted</li>
              </ol>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium">Your MCP Token:</label>
              <div className="relative">
                <textarea
                  id="mcpToken"
                  value={tokenData.token}
                  readOnly
                  className="w-full p-3 border border-border rounded-md bg-muted/50 font-mono text-xs resize-none"
                  rows={6}
                />
                <Button
                  className="absolute top-2 right-2"
                  size="sm"
                  onClick={copyToken}
                  id="copyBtn"
                >
                  📋 Copy
                </Button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>⚠️ Important:</strong> This token expires in 7 days. Keep it secure and don't share it with anyone.
              </p>
            </div>

            <div className="mt-6 flex justify-center">
              <Button variant="outline" onClick={() => router.push("/")}>
                Back to Collab
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 