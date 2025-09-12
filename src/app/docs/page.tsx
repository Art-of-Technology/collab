// app/docs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { ApiDocumentation } from 'api-scanner/client';
import type { ApiDocumentationType } from 'api-scanner/client';

export default function DocsPage() {
  const [apiData, setApiData] = useState<ApiDocumentationType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api-documentation.json')
      .then(res => res.json())
      .then(data => {
        setApiData(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Failed to load API documentation:', error);
        setLoading(false);
      });
  }, []);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground text-4xl">⏳</div>
          <h2 className="text-2xl font-bold">Loading Documentation...</h2>
          <p className="text-muted-foreground">Please wait while we load the API documentation.</p>
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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