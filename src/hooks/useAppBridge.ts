import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppScope } from '@/lib/apps/types';
import { useToast } from '@/hooks/use-toast';

interface AppContext {
  app: {
    id: string;
    name: string;
    slug: string;
  };
  installation: {
    id: string;
    scopes: AppScope[];
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
  theme: 'light' | 'dark';
  locale: string;
}

interface BridgeMessage {
  type: string;
  requestId?: string;
  payload?: any;
  timestamp: number;
}

interface UseAppBridgeProps {
  iframe: HTMLIFrameElement | null;
  allowedOrigin: string;
  context: AppContext;
}

export function useAppBridge({ iframe, allowedOrigin, context }: UseAppBridgeProps) {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const pendingRequests = useRef(new Map<string, (response: any) => void>());
  const messageRateLimit = useRef(new Map<string, { count: number; resetTime: number }>());
  const bridgeId = useRef(`bridge_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
  const pendingInitialContext = useRef(false);
  const { toast } = useToast();
  // Debug: Log hook initialization
  useEffect(() => {
    const bridge = bridgeId.current;
    console.log('🌉 Bridge: useAppBridge initialized', {
      bridgeId: bridge,
      appId: context.app.id,
      allowedOrigin,
      hasIframe: !!iframe
    });
    
    return () => {
      console.log('🌉 Bridge: useAppBridge cleanup', {
        bridgeId: bridge,
        appId: context.app.id
      });
    };
  }, [context.app.id, allowedOrigin, iframe]);


  const sendMessage = useCallback((message: BridgeMessage) => {
    if (!iframe?.contentWindow) return;
    
    iframe.contentWindow.postMessage(message, allowedOrigin);
  }, [iframe, allowedOrigin]);

  const generateRequestId = useCallback(() => {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Rate limiting for postMessage
  const rateLimitMessage = useCallback((key: string, limit: number = 50, windowMs: number = 60000): boolean => {
    const now = Date.now();
    const record = messageRateLimit.current.get(key);

    if (!record || now > record.resetTime) {
      messageRateLimit.current.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (record.count >= limit) {
      return false;
    }

    record.count++;
    return true;
  }, []);

  // Handle scope validation
  const hasScope = useCallback((requiredScope: AppScope): boolean => {
    return context.installation.scopes.includes(requiredScope);
  }, [context.installation.scopes]);

  // Bridge method handlers
  const handleGetContext = useCallback((requestId: string) => {
    const response: BridgeMessage = {
      type: 'context_response',
      requestId,
      payload: {
        app: context.app,
        installation: {
          id: context.installation.id,
          scopes: context.installation.scopes
        },
        workspace: context.workspace,
        user: {
          id: context.user.id,
          name: context.user.name,
          email: context.user.email
          // Don't expose internal role details
        },
        theme: context.theme,
        locale: context.locale,
        apiBase: `${window.location.origin}/api/apps/${context.app.slug}`
      },
      timestamp: Date.now()
    };

    console.log('🌉 Bridge: Sending context response', { requestId, payload: response.payload });
    sendMessage(response);
  }, [context, sendMessage]);

  // Send pending initial context when iframe becomes available
  useEffect(() => {
    if (iframe?.contentWindow && pendingInitialContext.current) {
      console.log('🌉 Bridge: Iframe now available, sending pending initial context');
      pendingInitialContext.current = false;
      handleGetContext('initial');
    }
  }, [iframe?.contentWindow, handleGetContext]);

  const handleShowToast = useCallback((payload: { message: string; type?: 'success' | 'error' | 'info' }) => {
    const { message, type = 'info' } = payload;
    
    switch (type) {
      case 'success':
        toast({
          title: message,
          variant: 'default'
        });
        break;
      case 'error':
        toast({
          title: message,
          variant: 'destructive'
        });
        break;
      default:
        toast({
          title: message,
          variant: 'default'
        });
        break;
    }
  }, [toast]);

  const handleOpenIssue = useCallback((payload: { issueId: string }) => {
    // Check if app has permission to navigate
    if (!hasScope('issues:read')) {
      toast({
        title: 'App does not have permission to open issues',
        variant: 'destructive'
      });
      return;
    }

    const { issueId } = payload;
    // Navigate to issue - this would need to be adjusted based on your routing structure
    router.push(`/${context.workspace.slug}/issues/${issueId}`);
  }, [hasScope, router, context.workspace.slug, toast]);

  const handleNavigate = useCallback((payload: { path: string }) => {
    const { path } = payload;
    
    // Only allow navigation within the current workspace
    if (path.startsWith('/')) {
      const workspacePath = `/${context.workspace.slug}${path}`;
      router.push(workspacePath);
    } else {
      toast({
        title: 'Invalid navigation path',
        variant: 'destructive'
      });
    }
  }, [router, context.workspace.slug, toast]);

  // Message handler
  const handleMessage = useCallback((event: MessageEvent) => {
    // First check: Only process messages that look like app messages
    const message = event.data;
    const isAppMessage = message && typeof message === 'object' && message.type && typeof message.timestamp === 'number';
    
    // Debug logging in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🌉 Bridge: Received message', {
        bridgeId: bridgeId.current,
        origin: event.origin,
        expectedOrigin: allowedOrigin,
        hasIframe: !!iframe,
        hasContentWindow: !!iframe?.contentWindow,
        sourceMatches: event.source === iframe?.contentWindow,
        messageType: message?.type,
        isAppMessage,
        rawData: message
      });
    }

    // Enhanced origin validation
    if (event.origin !== allowedOrigin) {
      console.warn('🔒 Security: Blocked message from unauthorized origin:', event.origin, 'Expected:', allowedOrigin);
      return;
    }

    // Early return for non-app messages (ignore them completely)
    if (!isAppMessage) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔇 Bridge: Ignoring non-app message', { data: message, origin: event.origin });
      }
      return;
    }

    // Validate event source (only if iframe is loaded)
    if (iframe?.contentWindow && event.source !== iframe.contentWindow) {
      console.warn('🔒 Security: Message source does not match iframe window', {
        bridgeId: bridgeId.current,
        eventSource: event.source,
        iframeWindow: iframe.contentWindow,
        equal: event.source === iframe.contentWindow,
        iframeRef: iframe,
        messageType: event.data?.type,
        timestamp: event.data?.timestamp
      });
      
      // In development, let's be more permissive for debugging
      if (process.env.NODE_ENV !== 'development') {
        return;
      } else {
        console.log('🔧 Dev Mode: Allowing message despite source mismatch for debugging');
      }
    }

    // At this point, we know it's a valid app message
    const appMessage: BridgeMessage = message;

    // Validate message timestamp (prevent replay attacks)
    const now = Date.now();
    const messageAge = now - appMessage.timestamp;
    const MAX_MESSAGE_AGE = process.env.NODE_ENV === 'development' ? 300000 : 30000; // 5 min dev, 30s prod
    
    if (messageAge > MAX_MESSAGE_AGE || messageAge < -10000) { // Allow 10s clock skew
      console.warn('🔒 Security: Message timestamp outside acceptable range:', {
        messageAge,
        maxAge: MAX_MESSAGE_AGE,
        messageTimestamp: appMessage.timestamp,
        now
      });
      return;
    }

    // Rate limiting per message type
    const messageKey = `${event.origin}:${appMessage.type}`;
    if (!rateLimitMessage(messageKey)) {
      console.warn('🔒 Security: Message rate limit exceeded for:', messageKey);
      return;
    }

    // Handle different message types
    switch (appMessage.type) {
      case 'app_ready':
        console.log('🌉 Bridge: App ready received', { hasIframe: !!iframe, hasContentWindow: !!iframe?.contentWindow });
        setIsReady(true);
        // Only send initial context if iframe is properly mounted
        if (iframe?.contentWindow) {
          console.log('🌉 Bridge: Iframe ready, sending initial context');
          handleGetContext('initial');
        } else {
          console.log('🌉 Bridge: Iframe not ready yet, will send context when mounted');
          // Store that we need to send initial context
          pendingInitialContext.current = true;
        }
        break;

      case 'get_context':
        if (appMessage.requestId) {
          handleGetContext(appMessage.requestId);
        }
        break;

      case 'show_toast':
        if (appMessage.payload) {
          handleShowToast(appMessage.payload);
        }
        break;

      case 'open_issue':
        if (appMessage.payload) {
          handleOpenIssue(appMessage.payload);
        }
        break;

      case 'navigate':
        if (appMessage.payload) {
          handleNavigate(appMessage.payload);
        }
        break;

      case 'response':
        // Handle responses to requests we sent
        if (appMessage.requestId) {
          const resolver = pendingRequests.current.get(appMessage.requestId);
          if (resolver && typeof resolver === 'function') {
            resolver(appMessage.payload);
            pendingRequests.current.delete(appMessage.requestId);
          }
        }
        break;

      default:
        console.warn('Unknown message type:', appMessage.type);
        break;
    }
  }, [
    allowedOrigin,
    handleGetContext,
    handleShowToast,
    handleOpenIssue,
    handleNavigate,
    iframe,
    rateLimitMessage
  ]);

  // Set up message listener
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Send ready signal when iframe loads
  useEffect(() => {
    if (iframe) {
      const handleLoad = () => {
        // Give the iframe a moment to set up its message handlers
        setTimeout(() => {
          sendMessage({
            type: 'host_ready',
            payload: { context },
            timestamp: Date.now()
          });
        }, 100);
      };

      iframe.addEventListener('load', handleLoad);
      return () => iframe.removeEventListener('load', handleLoad);
    }
  }, [iframe, sendMessage, context]);

  return {
    isReady,
    sendMessage,
    hasScope
  };
}
