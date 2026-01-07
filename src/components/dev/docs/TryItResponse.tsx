'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CodeBlock } from './CodeBlock';
import { Copy, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildUrl, generateCurlCommand } from './tryItUtils';
import { Endpoint } from './types';

interface TryItResponseProps {
  endpoint: Endpoint;
  baseUrl: string;
  pathParams: Record<string, string>;
  queryParams: Record<string, string>;
  requestBody: string;
  authHeader: string;
  bodyMode: 'form' | 'json';
  response: {
    status: number;
    statusText: string;
    data: any;
    headers: Record<string, string>;
  } | null;
  error: string | null;
  showHeaders: boolean;
  onToggleHeaders: (open: boolean) => void;
}

export function TryItResponse({
  endpoint,
  baseUrl,
  pathParams,
  queryParams,
  requestBody,
  authHeader,
  bodyMode,
  response,
  error,
  showHeaders,
  onToggleHeaders,
}: TryItResponseProps) {
  if (!response && !error) return null;

  return (
    <div className="mt-6 pt-6 border-t border-[#1f1f1f]">
      <h4 className="text-sm font-semibold mb-4">Responses</h4>
      
      {error ? (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-400 mb-2">
            <XCircle className="h-4 w-4" />
            <span className="font-medium">Error</span>
          </div>
          <p className="text-sm text-red-300/80">{error}</p>
        </div>
      ) : response ? (
        <div className="space-y-4">
          {/* Curl Command */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-medium text-muted-foreground">Curl</h5>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      generateCurlCommand(endpoint, baseUrl, pathParams, queryParams, requestBody, authHeader, bodyMode)
                    );
                  } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                  }
                }}
                className="h-6 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <CodeBlock 
              code={generateCurlCommand(endpoint, baseUrl, pathParams, queryParams, requestBody, authHeader, bodyMode)} 
            />
          </div>

          {/* Request URL */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-medium text-muted-foreground">Request URL</h5>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(buildUrl(endpoint.url, baseUrl, pathParams, queryParams));
                  } catch (error) {
                    console.error('Failed to copy to clipboard:', error);
                  }
                }}
                className="h-6 text-xs"
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className="p-3 bg-[#090909] border border-[#1f1f1f] rounded-md">
              <code className="text-xs text-foreground break-all">
                {buildUrl(endpoint.url, baseUrl, pathParams, queryParams)}
              </code>
            </div>
          </div>

          {/* Server Response */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-medium text-muted-foreground">Server response</h5>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
                    } catch (error) {
                      console.error('Failed to copy to clipboard:', error);
                    }
                  }}
                  className="h-6 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
            
            {/* Status Code */}
            <div className="mb-3">
              <Badge
                className={cn(
                  'text-xs',
                  response.status >= 200 && response.status < 300
                    ? 'bg-green-500/20 text-green-400 border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                )}
              >
                Code: {response.status}
              </Badge>
              <span className="text-xs text-muted-foreground ml-2">{response.statusText}</span>
            </div>

            {/* Response Body */}
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Response body</p>
              <CodeBlock code={JSON.stringify(response.data, null, 2)} />
            </div>

            {/* Response Headers - Collapsible */}
            {Object.keys(response.headers).length > 0 && (
              <div>
                <Collapsible open={showHeaders} onOpenChange={onToggleHeaders}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                    {showHeaders ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    Response headers
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <div className="p-3 bg-[#090909] border border-[#1f1f1f] rounded-md">
                      <div className="space-y-1">
                        {Object.entries(response.headers).map(([key, value]) => (
                          <div key={key} className="text-xs font-mono">
                            <span className="text-muted-foreground">{key}:</span>{' '}
                            <span className="text-foreground">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

