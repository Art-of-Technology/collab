'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Endpoint } from './types';
import { Play, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TryItFormFields } from './TryItFormFields';
import { TryItResponse } from './TryItResponse';
import { getFormFields, buildUrl as buildUrlUtil } from './tryItUtils';

interface TryItModalProps {
  endpoint: Endpoint;
  baseUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TryItModal({ endpoint, baseUrl, open, onOpenChange }: TryItModalProps) {
  const [pathParams, setPathParams] = useState<Record<string, string>>({});
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [requestBody, setRequestBody] = useState<string>('');
  const [bodyMode, setBodyMode] = useState<'form' | 'json'>('form');
  const [authHeader, setAuthHeader] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    data: any;
    headers: Record<string, string>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeaders, setShowHeaders] = useState(false);

  // Reset all state when modal opens or endpoint changes
  useEffect(() => {
    if (!open) return;

    // Reset response and error
    setResponse(null);
    setError(null);
    setBodyMode('form');

    // Extract path parameters from URL
    const pathParamMatches = endpoint.url.match(/\{([^}]+)\}/g);
    if (pathParamMatches) {
      const params: Record<string, string> = {};
      pathParamMatches.forEach((match) => {
        const paramName = match.slice(1, -1);
        params[paramName] = '';
      });
      setPathParams(params);
    } else {
      setPathParams({});
    }

    // Initialize query parameters
    const queryParamsObj: Record<string, string> = {};
    endpoint.parameters?.forEach((param) => {
      // Support both 'in' and 'location' fields
      const paramLocation = param.in || param.location;
      if (paramLocation === 'query') {
        queryParamsObj[param.name] = param.default !== undefined ? String(param.default) : '';
      }
    });
    setQueryParams(queryParamsObj);

    // Initialize request body
    const reqBody = (endpoint as any).requestBody;
    if (reqBody?.example) {
      setRequestBody(JSON.stringify(reqBody.example, null, 2));
    } else if (reqBody?.schema) {
      setRequestBody(JSON.stringify({}, null, 2));
    } else {
      setRequestBody('');
    }

    // Get default auth header - try to get from cookies
    if (endpoint.requiresAuth) {
      // Try to get token from cookies (NextAuth stores session in cookies)
      const getTokenFromCookies = () => {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          // NextAuth uses 'next-auth.session-token' or similar
          if (name.includes('session-token') || name.includes('next-auth')) {
            return value;
          }
        }
        return null;
      };

      const token = getTokenFromCookies();
      if (token && endpoint.authentication?.headerFormat) {
        const format = endpoint.authentication.headerFormat;
        setAuthHeader(format.replace('<your-token>', token).replace('YOUR_TOKEN', token));
      } else if (token) {
        setAuthHeader(`Bearer ${token}`);
      } else if (endpoint.authentication?.headerFormat) {
        setAuthHeader(endpoint.authentication.headerFormat.replace('<your-token>', 'YOUR_TOKEN').replace('YOUR_TOKEN', 'YOUR_TOKEN'));
      } else {
        setAuthHeader('Bearer YOUR_TOKEN');
      }
    } else {
      setAuthHeader('');
    }
  }, [open, endpoint.url, endpoint.parameters, (endpoint as any).requestBody, endpoint.requiresAuth, endpoint.authentication]);

  const buildUrl = () => buildUrlUtil(endpoint.url, baseUrl, pathParams, queryParams);

  const handleClear = () => {
    // Reset path params
    const pathParamMatches = endpoint.url.match(/\{([^}]+)\}/g);
    if (pathParamMatches) {
      const params: Record<string, string> = {};
      pathParamMatches.forEach((match) => {
        const paramName = match.slice(1, -1);
        params[paramName] = '';
      });
      setPathParams(params);
    } else {
      setPathParams({});
    }

    // Reset query params
    const queryParamsObj: Record<string, string> = {};
    endpoint.parameters?.forEach((param) => {
      const paramLocation = param.in || param.location;
      if (paramLocation === 'query') {
        queryParamsObj[param.name] = param.default !== undefined ? String(param.default) : '';
      }
    });
    setQueryParams(queryParamsObj);

    // Reset request body
    const reqBody = (endpoint as any).requestBody;
    if (reqBody?.example) {
      setRequestBody(JSON.stringify(reqBody.example, null, 2));
    } else if (reqBody?.schema) {
      setRequestBody(JSON.stringify({}, null, 2));
    } else {
      setRequestBody('');
    }

    // Reset response
    setResponse(null);
    setError(null);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const url = buildUrl();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const options: RequestInit = {
        method: endpoint.method,
        headers,
      };

      if (['POST', 'PUT', 'PATCH'].includes(endpoint.method) && requestBody && requestBody.trim() !== '') {
        try {
          if (bodyMode === 'json') {
            options.body = JSON.parse(requestBody);
          } else {
            // Form mode: build JSON from form fields
            const formJson: Record<string, any> = {};
            getFormFields(endpoint).forEach(field => {
              const input = document.getElementById(`body-${field.key}`) as HTMLInputElement;
              if (input && input.value) {
                formJson[field.key] = field.type === 'number' ? Number(input.value) : input.value;
              }
            });
            options.body = JSON.stringify(formJson);
          }
        } catch (e) {
          setError('Invalid JSON in request body');
          setLoading(false);
          return;
        }
      }

      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({ error: 'No JSON response' }));

      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      setResponse({
        status: res.status,
        statusText: res.statusText,
        data,
        headers: responseHeaders,
      });
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  const updatePathParam = (key: string, value: string) => {
    setPathParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateQueryParam = (key: string, value: string) => {
    setQueryParams((prev) => ({ ...prev, [key]: value }));
  };

  const updateFormField = (key: string, value: any) => {
    try {
      const currentBody = requestBody ? JSON.parse(requestBody) : {};
      const updated = { ...currentBody, [key]: value };
      setRequestBody(JSON.stringify(updated, null, 2));
    } catch (e) {
      // If parsing fails, create new object
      setRequestBody(JSON.stringify({ [key]: value }, null, 2));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-4xl w-full mx-4 flex flex-col bg-[#101011] border-[#1f1f1f] p-0 overflow-hidden", response || error ? "max-h-[90vh]" : "max-h-[85vh]")}>
        <div className="flex-shrink-0 p-4 sm:p-6 pb-4 border-b border-[#1f1f1f]">
          <DialogHeader>
            <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-base sm:text-lg">{endpoint.method}</span>
              <code className="text-xs sm:text-sm font-mono break-all">{endpoint.url}</code>
            </DialogTitle>
            <DialogDescription className="text-sm">{endpoint.title}</DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className={cn("px-4 sm:px-6", response || error ? "flex-1 min-h-0 overflow-y-auto" : "")}>
          <div className="space-y-6 py-4">
            <TryItFormFields
              endpoint={endpoint}
              pathParams={pathParams}
              queryParams={queryParams}
              requestBody={requestBody}
              bodyMode={bodyMode}
              authHeader={authHeader}
              onPathParamChange={updatePathParam}
              onQueryParamChange={updateQueryParam}
              onRequestBodyChange={setRequestBody}
              onBodyModeChange={setBodyMode}
              onAuthHeaderChange={setAuthHeader}
              onFormFieldChange={updateFormField}
            />

            {/* Execute/Clear Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-[#1f1f1f]">
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={loading}
                className="border-[#1f1f1f] hover:bg-[#1f1f1f] w-full sm:w-auto"
              >
                Clear
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-primary text-primary-foreground hover:bg-primary/90 w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute
                  </>
                )}
              </Button>
            </div>

            <TryItResponse
              endpoint={endpoint}
              baseUrl={baseUrl}
              pathParams={pathParams}
              queryParams={queryParams}
              requestBody={requestBody}
              authHeader={authHeader}
              bodyMode={bodyMode}
              response={response}
              error={error}
              showHeaders={showHeaders}
              onToggleHeaders={setShowHeaders}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

