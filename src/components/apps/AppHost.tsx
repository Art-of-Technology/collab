'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppBridge } from '@/hooks/useAppBridge';
import { AppScope } from '@/lib/apps/types';

interface AppHostProps {
  app: {
    id: string;
    name: string;
    slug: string;
    iconUrl?: string;
    entrypointUrl: string;
  };
  installation: {
    id: string;
    scopes: string[];
    status: string;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export function AppHost({ app, installation, workspace, user }: AppHostProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Initialize the app bridge
  const { sendMessage, isReady } = useAppBridge({
    iframe: iframeRef.current,
    allowedOrigin: new URL(app.entrypointUrl).origin,
    context: {
      app: {
        id: app.id,
        name: app.name,
        slug: app.slug
      },
      installation: {
        id: installation.id,
        scopes: installation.scopes as AppScope[]
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      theme: 'light', // TODO: Get from theme context
      locale: 'en-US' // TODO: Get from user preferences
    }
  });

  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setError('Failed to load the app. The app may be temporarily unavailable.');
  };

  const handleRetry = () => {
    setIsRetrying(true);
    setError(null);
    setIsLoading(true);
    
    if (iframeRef.current) {
      // Force reload the iframe
      const currentSrc = iframeRef.current.src;
      iframeRef.current.src = '';
      setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.src = currentSrc;
        }
        setIsRetrying(false);
      }, 100);
    }
  };

  // Handle suspended or inactive installations
  if (installation.status !== 'ACTIVE') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            App Unavailable
          </h2>
          <p className="text-gray-600 mb-4">
            This app is currently {installation.status.toLowerCase()} and cannot be accessed.
          </p>
          <Button variant="outline" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Failed to Load App
          </h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button 
            onClick={handleRetry} 
            disabled={isRetrying}
            className="gap-2"
          >
            {isRetrying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[600px]">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Loading {app.name}
            </h3>
            <p className="text-gray-600">
              Please wait while the app initializes...
            </p>
          </div>
        </div>
      )}

      {/* App iframe */}
      <iframe
        ref={iframeRef}
        src={app.entrypointUrl}
        title={`${app.name} - App`}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-forms allow-popups allow-same-origin allow-downloads allow-modals"
        allow="clipboard-read; clipboard-write"
        loading="lazy"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        referrerPolicy="strict-origin-when-cross-origin"
        style={{
          minHeight: '600px',
          height: 'calc(100vh - 100px)' // Account for header/navigation
        }}
        data-app-id={app.id}
        data-installation-id={installation.id}
      />

      {/* Bridge status indicator (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 right-2 z-20">
          <div
            className={`px-2 py-1 rounded text-xs font-medium ${
              isReady
                ? 'bg-green-100 text-green-800 border border-green-200'
                : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
            }`}
          >
            Bridge: {isReady ? 'Connected' : 'Connecting...'}
          </div>
        </div>
      )}
    </div>
  );
}
