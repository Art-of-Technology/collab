'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertCircle, Zap, FileText, List, Database, Info, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Endpoint } from './types';
import { CodeBlock } from './CodeBlock';
import { TryItModal } from './TryItModal';

function replaceApiKeyPlaceholders(code: string, apiKey: string): string {
  // Replace common API key placeholders with the actual API key
  // Handle various formats: YOUR_API_KEY, <your-api-key>, 'YOUR_API_KEY', "YOUR_API_KEY", etc.
  return code
    // Replace in quotes (single and double)
    .replace(/(['"])(YOUR_API_KEY|YOUR_TOKEN|your-api-key|your-token)\1/g, `$1${apiKey}$1`)
    // Replace without quotes (but preserve surrounding context)
    .replace(/\bYOUR_API_KEY\b/g, apiKey)
    .replace(/\bYOUR_TOKEN\b/g, apiKey)
    // Replace in angle brackets
    .replace(/<your-api-key>/g, apiKey)
    .replace(/<your-token>/g, apiKey)
    // Replace environment variable references
    .replace(/process\.env\.API_KEY/g, `'${apiKey}'`)
    .replace(/process\.env\.COLLAB_API_KEY/g, `'${apiKey}'`)
    .replace(/process\.env\.NEXT_PUBLIC_API_KEY/g, `'${apiKey}'`);
}

interface EndpointCardProps {
  endpoint: Endpoint;
  baseUrl: string;
  apiKey?: string | null;
}

export function EndpointCard({ endpoint, baseUrl, apiKey }: EndpointCardProps) {
  const [tryItOpen, setTryItOpen] = useState(false);
  
  const methodColors: Record<string, string> = {
    GET: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    POST: 'bg-green-500/20 text-green-400 border-green-500/30',
    PUT: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    PATCH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const methodColor = methodColors[endpoint.method] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';

  return (
    <>
      <Card className="mb-6 border-[#1f1f1f] bg-[#101011]">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className={cn('font-mono text-xs', methodColor)}>
                  {endpoint.method}
                </Badge>
                <code className="text-sm sm:text-base text-foreground break-all">{endpoint.url}</code>
              </div>
              <CardTitle className="text-lg sm:text-xl mb-1">{endpoint.title}</CardTitle>
              {endpoint.summary && endpoint.summary !== endpoint.description && (
                <CardDescription className="text-sm mb-1">{endpoint.summary}</CardDescription>
              )}
              <CardDescription className="text-sm">{endpoint.description}</CardDescription>
              {endpoint.file && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3" />
                  <code className="text-xs">{endpoint.file}</code>
                </div>
              )}
            </div>
            <Button
              onClick={() => setTryItOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
            >
              <Play className="h-4 w-4" />
              Try it
            </Button>
          </div>
        </CardHeader>
      <CardContent className="space-y-4">
        {endpoint.requiresAuth && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Shield className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-200 flex-1 space-y-2">
                <div>
                  <p className="font-medium mb-1">Authentication Required</p>
                  <p className="text-yellow-300/80">{endpoint.authentication?.description || 'Bearer token authentication required'}</p>
                </div>
                {endpoint.authentication?.headerFormat && (
                  <div>
                    <p className="text-xs font-medium mb-1">Header Format:</p>
                    <code className="text-xs bg-yellow-500/20 px-2 py-1 rounded">{endpoint.authentication.headerFormat}</code>
                  </div>
                )}
                {endpoint.authentication?.loginEndpoint && (
                  <div>
                    <p className="text-xs font-medium mb-1">Login Endpoint:</p>
                    <code className="text-xs bg-yellow-500/20 px-2 py-1 rounded">{endpoint.authentication.loginEndpoint}</code>
                  </div>
                )}
                {endpoint.authentication?.example && (
                  <div>
                    <p className="text-xs font-medium mb-1">Example Headers:</p>
                    <CodeBlock code={JSON.stringify(endpoint.authentication.example, null, 2)} language="json" />
                  </div>
                )}
                {endpoint.authentication?.steps && endpoint.authentication.steps.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Authentication Steps:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs text-yellow-300/80">
                      {endpoint.authentication.steps.map((step: string, idx: number) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {endpoint.parameters && endpoint.parameters.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <List className="h-4 w-4" />
              Parameters
            </h4>
            <div className="space-y-2">
              {endpoint.parameters.map((param: any, idx: number) => (
                <div key={idx} className="p-2 bg-muted/50 rounded text-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                    <code className="text-primary font-mono text-xs sm:text-sm">{param.name || param.param}</code>
                    {param.required && (
                      <Badge variant="outline" className="text-xs w-fit">Required</Badge>
                    )}
                    {param.type && (
                      <Badge variant="outline" className="text-xs w-fit">{param.type}</Badge>
                    )}
                  </div>
                  {param.description && (
                    <p className="text-muted-foreground text-xs">{param.description}</p>
                  )}
                  {param.default !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1">Default: <code>{String(param.default)}</code></p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(endpoint as any).requestBody && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Request Body</h4>
            <div className="space-y-2">
              {(endpoint as any).requestBody.description && (
                <p className="text-sm text-muted-foreground">{(endpoint as any).requestBody.description}</p>
              )}
              {(endpoint as any).requestBody.schema && (
                <div>
                  <p className="text-xs font-medium mb-1">Schema:</p>
                  <CodeBlock code={JSON.stringify((endpoint as any).requestBody.schema, null, 2)} language="json" />
                </div>
              )}
              {(endpoint as any).requestBody.example && (
                <div>
                  <p className="text-xs font-medium mb-1">Example:</p>
                  <CodeBlock code={JSON.stringify((endpoint as any).requestBody.example, null, 2)} language="json" />
                </div>
              )}
              {(endpoint as any).requestBody.required && (endpoint as any).requestBody.required.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Required Fields:</p>
                  <div className="flex flex-wrap gap-1">
                    {(endpoint as any).requestBody.required.map((field: string, idx: number) => (
                      <Badge key={idx} variant="outline" className="text-xs">{field}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {endpoint.requestHeaders && endpoint.requestHeaders.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Request Headers</h4>
            <div className="space-y-2">
              {endpoint.requestHeaders.map((header, idx) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                  <code className="text-primary font-mono text-xs sm:text-sm">{header.name}</code>
                  {header.required && (
                    <Badge variant="outline" className="text-xs w-fit">Required</Badge>
                  )}
                  <span className="text-muted-foreground text-xs sm:text-sm">{header.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {endpoint.responses && Object.keys(endpoint.responses).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Responses</h4>
            <Tabs defaultValue={Object.keys(endpoint.responses)[0]} className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 overflow-x-auto">
                {Object.entries(endpoint.responses).map(([statusCode, response]: [string, any]) => (
                  <TabsTrigger key={statusCode} value={statusCode} className="text-xs sm:text-sm whitespace-nowrap">
                    {statusCode}
                  </TabsTrigger>
                ))}
              </TabsList>
              {Object.entries(endpoint.responses).map(([statusCode, response]: [string, any]) => (
                <TabsContent key={statusCode} value={statusCode} className="mt-3">
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{response.description}</p>
                    {response.requiredFields && response.requiredFields.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">Required Fields:</p>
                        <div className="flex flex-wrap gap-1">
                          {response.requiredFields.map((field: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">{field}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {response.optionalFields && response.optionalFields.length > 0 && (
                      <div>
                        <p className="text-xs font-medium mb-1">Optional Fields:</p>
                        <div className="flex flex-wrap gap-1">
                          {response.optionalFields.map((field: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs bg-muted">{field}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {response.example && (
                      <div>
                        <p className="text-xs font-medium mb-1">Example Response:</p>
                        <CodeBlock code={JSON.stringify(response.example, null, 2)} language="json" />
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}

        {(endpoint as any).responseSchema && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Database className="h-4 w-4" />
              Response Schema
            </h4>
            <CodeBlock code={JSON.stringify((endpoint as any).responseSchema, null, 2)} language="json" />
          </div>
        )}

        {endpoint.codeExamples && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Code Example</h4>
            <CodeBlock 
              code={apiKey ? replaceApiKeyPlaceholders(endpoint.codeExamples.example, apiKey) : endpoint.codeExamples.example} 
              language={endpoint.codeExamples.language} 
            />
          </div>
        )}

        {endpoint.errorHandling && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Error Handling
            </h4>
            {endpoint.errorHandling.commonErrors && endpoint.errorHandling.commonErrors.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium mb-2 text-muted-foreground">Common Errors:</p>
                <div className="space-y-2">
                  {endpoint.errorHandling.commonErrors.map((error, idx) => (
                    <div key={idx} className="p-2 bg-red-500/10 border border-red-500/20 rounded text-sm">
                      <div className="font-medium text-red-400">{error.statusCode}: {error.description}</div>
                      <div className="text-red-300/80 text-xs mt-1">{error.handling}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(endpoint.errorHandling as any).endpointSpecific && (endpoint.errorHandling as any).endpointSpecific.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2 text-muted-foreground">Endpoint-Specific Errors:</p>
                <div className="space-y-2">
                  {(endpoint.errorHandling as any).endpointSpecific.map((error: any, idx: number) => (
                    <div key={idx} className="p-2 bg-green-500/10 border border-green-500/20 rounded text-sm">
                      <div className="font-medium text-green-400">{error.statusCode}: {error.description}</div>
                      {error.handling && (
                        <div className="text-green-300/80 text-xs mt-1">{error.handling}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {endpoint.rateLimiting && endpoint.rateLimiting.enabled && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-200 flex-1 space-y-2">
                <div>
                  <p className="font-medium mb-1">Rate Limiting</p>
                  <p className="text-blue-300/80">
                    {endpoint.rateLimiting.limits.requests} requests per {endpoint.rateLimiting.limits.window}
                  </p>
                  {endpoint.rateLimiting.limits.burst && (
                    <p className="text-blue-300/80 text-xs mt-1">
                      Burst limit: {endpoint.rateLimiting.limits.burst} requests
                    </p>
                  )}
                </div>
                {(endpoint.rateLimiting as any).headers && (
                  <div>
                    <p className="text-xs font-medium mb-1">Rate Limit Headers:</p>
                    <div className="space-y-1 text-xs">
                      {Object.entries((endpoint.rateLimiting as any).headers).map(([key, value]: [string, any]) => (
                        <div key={key} className="flex items-center gap-2">
                          <code className="text-blue-300 font-mono">{key}:</code>
                          <span className="text-blue-300/80">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(endpoint.rateLimiting as any).handling && (
                  <div>
                    <p className="text-xs font-medium mb-1">Handling:</p>
                    <p className="text-blue-300/80 text-xs">{(endpoint.rateLimiting as any).handling}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {endpoint.pagination && endpoint.pagination.supported && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Pagination
            </h4>
            <div className="space-y-3">
              {endpoint.pagination.parameters && (
                <div>
                  <p className="text-xs font-medium mb-2">Parameters:</p>
                  <div className="space-y-2">
                    {Object.entries(endpoint.pagination.parameters).map(([key, param]: [string, any]) => (
                      <div key={key} className="p-2 bg-muted/50 rounded text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-primary font-mono text-xs">{key}</code>
                          <Badge variant="outline" className="text-xs">{param.type || 'any'}</Badge>
                          {param.default !== undefined && (
                            <span className="text-xs text-muted-foreground">Default: {param.default}</span>
                          )}
                        </div>
                        {param.description && (
                          <p className="text-xs text-muted-foreground">{param.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(endpoint.pagination as any).response && (
                <div>
                  <p className="text-xs font-medium mb-1">Response Format:</p>
                  <CodeBlock code={JSON.stringify((endpoint.pagination as any).response, null, 2)} language="json" />
                </div>
              )}
              {(endpoint.pagination as any).example && (
                <div>
                  <p className="text-xs font-medium mb-1">Example:</p>
                  <div className="space-y-2">
                    {(endpoint.pagination as any).example.request && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Request:</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{(endpoint.pagination as any).example.request}</code>
                      </div>
                    )}
                    {(endpoint.pagination as any).example.response && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Response:</p>
                        <CodeBlock code={JSON.stringify((endpoint.pagination as any).example.response, null, 2)} language="json" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    <TryItModal
      endpoint={endpoint}
      baseUrl={baseUrl}
      open={tryItOpen}
      onOpenChange={setTryItOpen}
    />
    </>
  );
}

