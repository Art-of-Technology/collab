'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Book } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiDocumentation, EndpointCard, ApiDocsSidebar, MarkdownDocViewer } from '@/components/dev/docs';
import type { Endpoint } from '@/components/dev/docs';

type DocSection = 'endpoints' | 'oauth' | 'third-party';

export default function ApiDocsPage() {
  const [data, setData] = useState<ApiDocumentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<DocSection>('endpoints');
  const [oauthContent, setOauthContent] = useState<string>('');
  const [thirdPartyContent, setThirdPartyContent] = useState<string>('');
  const [apiKey, setApiKey] = useState<string | null>(null);

  // Handle hash changes for internal navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#oauth') {
        setSelectedSection('oauth');
      }
    };

    // Check initial hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    // Load API documentation
    fetch('/api-documentation.json')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        if (json.endpoints && json.endpoints.length > 0) {
          const firstEndpoint = json.endpoints[0];
          setSelectedEndpoint(firstEndpoint.url);
          setSelectedMethod(firstEndpoint.method);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });

    // Load OAuth and Third-party documentation in parallel
    const loadDocs = async () => {
      try {
        const [oauthRes, thirdPartyRes] = await Promise.all([
          fetch('/docs/oauth-endpoints.md'),
          fetch('/docs/third-party-api.md'),
        ]);

        if (oauthRes.ok) {
          const oauthText = await oauthRes.text();
          setOauthContent(oauthText);
        } else {
          setOauthContent('# OAuth 2.0 Documentation\n\nFailed to load OAuth documentation.');
        }

        if (thirdPartyRes.ok) {
          const thirdPartyText = await thirdPartyRes.text();
          setThirdPartyContent(thirdPartyText);
        } else {
          setThirdPartyContent('# Third-Party API Documentation\n\nFailed to load Third-party API documentation.');
        }
      } catch (err) {
        console.error('Error loading documentation:', err);
      }
    };

    loadDocs();

    // Fetch API key
    const fetchApiKey = async () => {
      try {
        const res = await fetch('/api/dev/api-key', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setApiKey(data.apiKey || null);
        }
      } catch (err) {
        console.error('Error fetching API key:', err);
      }
    };

    fetchApiKey();
  }, []);

  const filteredEndpoints = useMemo(() => {
    if (!data?.endpoints) return [];
    if (!searchQuery.trim()) return data.endpoints;
    const query = searchQuery.toLowerCase();
    return data.endpoints.filter(
      (endpoint) =>
        endpoint.title.toLowerCase().includes(query) ||
        endpoint.url.toLowerCase().includes(query) ||
        endpoint.description.toLowerCase().includes(query) ||
        endpoint.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [data, searchQuery]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return { endpoints: false, oauth: false, thirdParty: false };
    }
    const query = searchQuery.toLowerCase();
    return {
      endpoints: filteredEndpoints.length > 0,
      oauth: oauthContent.toLowerCase().includes(query),
      thirdParty: thirdPartyContent.toLowerCase().includes(query),
    };
  }, [searchQuery, filteredEndpoints, oauthContent, thirdPartyContent]);

  const prevSearchQueryRef = useRef<string>('');
  
  useEffect(() => {
    // Only auto-switch when search query actually changes, not when section changes
    if (!searchQuery.trim() || searchQuery === prevSearchQueryRef.current) {
      prevSearchQueryRef.current = searchQuery;
      return;
    }
    
    prevSearchQueryRef.current = searchQuery;
    
    // Auto-switch to section with matches, prioritizing OAuth > Third-party > Endpoints
    if (searchResults.oauth) {
      setSelectedSection('oauth');
    } else if (searchResults.thirdParty) {
      setSelectedSection('third-party');
    } else if (searchResults.endpoints && filteredEndpoints.length > 0) {
      setSelectedSection('endpoints');
    }
  }, [searchQuery, searchResults.oauth, searchResults.thirdParty, searchResults.endpoints, filteredEndpoints.length]);

  const currentEndpoint = useMemo(() => {
    if (!selectedEndpoint || !data?.endpoints) return null;
    return data.endpoints.find((ep) => 
      ep.url === selectedEndpoint && (!selectedMethod || ep.method === selectedMethod)
    ) || null;
  }, [selectedEndpoint, selectedMethod, data]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-4 sm:py-8 max-w-7xl">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading API documentation...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-4 sm:py-8 max-w-7xl">
        <Card className="border-red-500/20 bg-red-500/10">
          <CardHeader>
            <CardTitle className="text-red-400">Error loading documentation</CardTitle>
            <CardDescription>{error || 'Failed to load API documentation'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-4 sm:py-8 max-w-7xl">
      <div className="mb-4 sm:mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Book className="h-5 w-5 sm:h-6 sm:w-6" />
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">{data.info.title}</h1>
          <Badge variant="outline" className="text-xs">v{data.info.version}</Badge>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground mt-2">{data.info.description}</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2 text-xs sm:text-sm">
          <span className="text-muted-foreground">Base URL:</span>
          <code className="text-primary">{data.info.baseUrl}</code>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-12rem)] min-h-[400px]">
        <div className="hidden md:block">
              <ApiDocsSidebar
                endpoints={data.endpoints}
                selectedEndpoint={selectedEndpoint}
                selectedMethod={selectedMethod}
                selectedSection={selectedSection}
                onSelectEndpoint={(url, method) => {
                  setSelectedEndpoint(url);
                  setSelectedMethod(method);
                }}
                onSelectSection={setSelectedSection}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                searchResults={searchResults}
              />
        </div>

        <div className="flex-1 overflow-auto md:min-h-0">
          <ScrollArea className="h-full md:pr-4">
            {selectedSection === 'endpoints' && (
              currentEndpoint ? (
                <EndpointCard endpoint={currentEndpoint} baseUrl={data.info.baseUrl} apiKey={apiKey} />
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Select an endpoint to view details</p>
                </div>
              )
            )}
            {selectedSection === 'oauth' && (
                <MarkdownDocViewer 
                  title="OAuth 2.0 Endpoints for Third-Party Apps" 
                  content={oauthContent}
                />
            )}
            {selectedSection === 'third-party' && (
                <MarkdownDocViewer 
                  title="Third-Party App API Documentation" 
                  content={thirdPartyContent}
                />
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Mobile Sidebar */}
      <div className="md:hidden mt-4 space-y-4">
        <Card className="border-[#1f1f1f] bg-[#090909]">
          <CardHeader>
            <CardTitle className="text-sm">Documentation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button
                onClick={() => setSelectedSection('endpoints')}
                variant="ghost"
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors border justify-start',
                  selectedSection === 'endpoints'
                    ? 'bg-[#1f1f1f] text-white border-[#2a2a2a]'
                    : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white border-[#1f1f1f]'
                )}
              >
                API Endpoints
              </Button>
              <Button
                onClick={() => setSelectedSection('oauth')}
                variant="ghost"
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors border justify-start',
                  selectedSection === 'oauth'
                    ? 'bg-[#1f1f1f] text-white border-[#2a2a2a]'
                    : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white border-[#1f1f1f]'
                )}
              >
                OAuth 2.0
              </Button>
              <Button
                onClick={() => setSelectedSection('third-party')}
                variant="ghost"
                className={cn(
                  'w-full text-left px-3 py-2 rounded text-sm transition-colors border justify-start',
                  selectedSection === 'third-party'
                    ? 'bg-[#1f1f1f] text-white border-[#2a2a2a]'
                    : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white border-[#1f1f1f]'
                )}
              >
                Third-Party API
              </Button>
            </div>
          </CardContent>
        </Card>

        {selectedSection === 'endpoints' && (
          <Card className="border-[#1f1f1f] bg-[#090909]">
            <CardHeader>
              <CardTitle className="text-sm">Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64">
                <div className="space-y-2">
                  {filteredEndpoints.map((endpoint) => {
                    const endpointKey = `${endpoint.method}:${endpoint.url}:${endpoint.file}`;
                    return (
                      <Button
                        key={endpointKey}
                        onClick={() => {
                          setSelectedEndpoint(endpoint.url);
                          setSelectedMethod(endpoint.method);
                        }}
                        variant="ghost"
                        className={cn(
                          'w-full text-left px-3 py-2 rounded text-sm transition-colors border h-auto justify-start',
                          selectedEndpoint === endpoint.url && selectedMethod === endpoint.method
                            ? 'bg-[#1f1f1f] text-white border-[#2a2a2a]'
                            : 'text-gray-400 hover:bg-[#1f1f1f] hover:text-white border-[#1f1f1f]'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs font-mono">
                            {endpoint.method}
                          </Badge>
                          <span className="font-medium truncate">{endpoint.title}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{endpoint.url}</p>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {selectedSection === 'oauth' && (
          <MarkdownDocViewer 
            title="OAuth 2.0 Endpoints for Third-Party Apps" 
            content={oauthContent}
          />
        )}

        {selectedSection === 'third-party' && (
          <MarkdownDocViewer 
            title="Third-Party App API Documentation" 
            content={thirdPartyContent}
          />
        )}
      </div>
    </div>
  );
}

