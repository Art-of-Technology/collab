// app/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { ApiDocumentation } from 'api-scanner/client';
import type { ApiDocumentationType } from 'api-scanner/client';

export default function DocsPage() {
  const [apiData, setApiData] = useState<ApiDocumentationType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocumentation = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = forceRefresh ? '/api/docs?refresh=true' : '/api/docs';
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Failed to load API documentation: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.message || 'Failed to load API documentation');
      }
      
      setApiData(data);
    } catch (err) {
      console.error('Error loading API documentation:', err);
      setError(err instanceof Error ? err.message : 'Failed to load API documentation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocumentation();
  }, []);

  const handleRefresh = () => {
    loadDocumentation(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Loading API documentation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-destructive text-4xl">⚠️</div>
          <h2 className="text-2xl font-bold">Error Loading Documentation</h2>
          <p className="text-muted-foreground">{error}</p>
          <div className="space-x-2">
            <button
              onClick={() => loadDocumentation(false)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
            >
              Force Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!apiData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground text-4xl">📚</div>
          <h2 className="text-2xl font-bold">No Documentation Available</h2>
          <p className="text-muted-foreground">No API documentation was found or generated.</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            Generate Documentation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Optional: Header with refresh button */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">API Documentation</h1>
            <p className="text-sm text-muted-foreground">
              Generated on {new Date(apiData.generatedAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Main documentation component */}
      <ApiDocumentation
        data={apiData}
        searchable={true}
        showStats={true}
        defaultExpanded={false}
        theme="system"
        onEndpointSelect={(endpoint) => {
          // Optional: Analytics tracking, URL updates, etc.
          console.log('Selected endpoint:', endpoint.url);
          
          // Update URL hash for deep linking (optional)
          if (typeof window !== 'undefined') {
            const hash = endpoint.url.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            window.history.replaceState({}, '', `#${hash}`);
          }
        }}
      />
    </div>
  );
}